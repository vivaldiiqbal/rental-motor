const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const env = require('./config/env');
const requestIdMiddleware = require('./middleware/requestId');
const requestTimeout = require('./middleware/timeout');
const sanitizeInput = require('./middleware/sanitizeInput');
const { generalLimiter } = require('./middleware/rateLimiters');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const apiRoutes = require('./routes');

const app = express();

// 1. Matikan header x-powered-by demi keamanan informasi server
app.disable('x-powered-by');

// 2. Keamanan Header HTTP (Helmet)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// 3. CORS (Cross-Origin Resource Sharing)
// Mendukung beberapa origin dipisah koma (CLIENT_ORIGIN atau CORS_ORIGIN)
const rawOrigins = env.CLIENT_ORIGIN || env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = rawOrigins === '*'
  ? '*'
  : rawOrigins.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (seperti curl, mobile app, postman)
      if (!origin || allowedOrigins === '*') {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Di development/test, izinkan seluruh port localhost atau 127.0.0.1 (mis. 5173, 5174, dsb.)
      if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key', 'X-Idempotency-Key'],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replay'],
  }),
);

// 4. Kompresi respons HTTP (Gzip/Deflate)
app.use(compression());

// 5. Request ID Tracing unik per request
app.use(requestIdMiddleware);

// 6. Batas waktu request (Timeout 30 detik)
app.use(requestTimeout(30000));

// 7. Logging HTTP aman (dinonaktifkan pada test mode)
if (env.NODE_ENV !== 'test') {
  morgan.token('reqId', (req) => req.headers['x-request-id'] || req.id || '-');
  if (env.NODE_ENV === 'production') {
    app.use(
      morgan((tokens, req, res) => {
        return JSON.stringify({
          timestamp: tokens.date(req, res, 'iso'),
          method: tokens.method(req, res),
          url: tokens.url(req, res),
          status: Number(tokens.status(req, res)),
          contentLength: tokens.res(req, res, 'content-length') || 0,
          responseTimeMs: Number(tokens['response-time'](req, res)),
          requestId: tokens.reqId(req, res),
        });
      })
    );
  } else {
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms [reqId=:reqId]'));
  }
}

// 8. Body Parser dengan batas ukuran ketat 100 KB
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 9. Sanitasi Input: Tangkal Prototype Pollution & Stored XSS
app.use(sanitizeInput);

// 10. Rate Limiter Global (300 request / 15 menit per IP)
app.use(generalLimiter);

// 11. Static file untuk direktori uploads publik (foto motor) dengan header nosniff
app.use(
  '/uploads/motors',
  express.static(path.join(env.UPLOAD_PATH, 'motors'), {
    maxAge: '1d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// Serta akses terautentikasi dan terlindungi IDOR untuk berkas identitas di /uploads/documents/:filename
app.get('/uploads/documents/:filename', (req, res, next) => {
  const hasToken =
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) ||
    (req.query && typeof req.query.token === 'string' && req.query.token.trim() !== '');
  if (!hasToken) {
    return next();
  }
  const { authenticate } = require('./middleware/auth');
  return authenticate(req, res, async (err) => {
    if (err) return next(err);
    const fs = require('fs');
    const safeName = path.basename(req.params.filename || '');
    const filePath = path.join(env.UPLOAD_PATH, 'documents', safeName);
    if (!safeName || !fs.existsSync(filePath)) {
      return next();
    }

    // RBAC & IDOR Guard:
    // Admin dan Staff dapat melihat dokumen untuk moderasi verifikasi.
    // Customer HANYA boleh mengakses file dokumen miliknya sendiri yang tercatat di user_documents.
    const isStaffOrAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'staff');
    if (!isStaffOrAdmin) {
      try {
        let isOwner = false;
        if (env.USE_DB === 'postgres') {
          const { pool } = require('../db/pool');
          const ownerCheck = await pool.query(
            'SELECT 1 FROM user_documents WHERE stored_name = $1 AND user_id = $2 LIMIT 1',
            [safeName, req.user.id]
          );
          isOwner = ownerCheck.rows.length > 0;
        } else {
          const { store } = require('./repositories');
          const docs = store.getCollection('userDocuments') || [];
          isOwner = docs.some(
            (d) => (d.storedName === safeName || d.path?.includes(safeName)) && Number(d.userId) === Number(req.user.id)
          );
        }

        if (!isOwner) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Akses ditolak: Anda tidak memiliki izin untuk melihat dokumen ini.',
            },
          });
        }
      } catch (dbErr) {
        return next(dbErr);
      }
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(path.resolve(filePath));
  });
});

// 12. Root Welcome Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'RodaKita Motor Rental Backend API',
    version: '1.0.0',
    documentation: '/api/health',
    status: 'Running',
  });
});

// 13. Mount seluruh rute API publik & terlindungi
app.use('/api', apiRoutes);

// 14. 404 Handler untuk rute yang tidak terdaftar (mengembalikan JSON, bukan HTML)
app.use(notFound);

// 15. Global Error Handler terpusat (bebas crash)
app.use(errorHandler);

module.exports = app;
