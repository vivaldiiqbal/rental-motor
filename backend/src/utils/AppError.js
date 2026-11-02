/**
 * Custom Error class untuk backend RodaKita.
 * Menyimpan statusCode HTTP, kode error aplikasi, dan detail validasi (opsional).
 */
class AppError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';

    if (typeof code === 'number' && (typeof statusCode === 'string' || statusCode === undefined)) {
      this.statusCode = code;
      this.code = statusCode || 'INTERNAL_ERROR';
    } else {
      this.code = code || 'INTERNAL_ERROR';
      this.statusCode = typeof statusCode === 'number' ? statusCode : 500;
    }

    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
