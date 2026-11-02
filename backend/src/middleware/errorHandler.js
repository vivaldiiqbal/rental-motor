const logger = require('../utils/logger');
const { errorResponse } = require('../utils/response');

/**
 * Global Error Handler Middleware
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Terjadi kesalahan internal pada server.';
  let details = err.details || null;

  // Tangani syntax error JSON body dari Express
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Format JSON pada request body tidak valid.';
  }

  // Tangani JWT Error yang belum tertangkap
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Token otentikasi tidak valid.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Sesi telah kedaluwarsa. Silakan masuk kembali.';
  }

  // Log error jika status 500 (internal)
  if (statusCode >= 500) {
    console.log('SERVER_ERROR_MESSAGE:', err.message);
    console.log('SERVER_ERROR_STACK:', err.stack);
    logger.error(`[${req.id || 'NO_ID'}] ${req.method} ${req.originalUrl}:`, err);
  } else {
    logger.debug(`[${req.id || 'NO_ID'}] Client error ${statusCode} (${code}): ${message}`);
  }

  return errorResponse(res, {
    code,
    message,
    details,
    statusCode,
    requestId: req.id,
  });
}

module.exports = errorHandler;
