const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { userRepo } = require('../repositories');
const { sanitizeUser } = require('../utils/sanitize');

/**
 * Middleware untuk memproteksi endpoint privat (wajib login).
 */
async function protect(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = String(req.query.token);
  }

  if (!token) {
    return next(new AppError('Akses ditolak. Silakan login terlebih dahulu.', 'UNAUTHORIZED', 401));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await userRepo.findById(decoded.id);

    if (!user) {
      return next(new AppError('Pengguna dengan token ini sudah tidak terdaftar.', 'UNAUTHORIZED', 401));
    }

    if (user.isActive === false || user.is_active === false) {
      return next(new AppError('Akun Anda telah dinonaktifkan. Silakan hubungi administrator.', 'FORBIDDEN', 403));
    }

    req.user = sanitizeUser(user);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Sesi telah kedaluwarsa. Silakan login kembali.', 'TOKEN_EXPIRED', 401));
    }
    return next(new AppError('Token tidak valid atau rusak.', 'UNAUTHORIZED', 401));
  }
}

/**
 * Middleware opsional: jika token ada dan valid, tempelkan req.user.
 * Jika tidak ada atau invalid, biarkan lewat sebagai tamu tanpa error.
 */
async function optionalAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await userRepo.findById(decoded.id);
    req.user = user ? sanitizeUser(user) : null;
  } catch {
    req.user = null;
  }

  next();
}

/**
 * Middleware khusus hak akses admin.
 */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AppError('Akses terlarang. Hanya admin yang diizinkan.', 'FORBIDDEN', 403));
  }
  next();
}

module.exports = {
  protect,
  optionalAuth,
  adminOnly,
};
