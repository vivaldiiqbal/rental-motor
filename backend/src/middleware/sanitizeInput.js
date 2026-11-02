const AppError = require('../utils/AppError');

/**
 * Cek apakah sebuah objek mengandung kunci prototype pollution berbahaya.
 */
function hasPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') return false;

  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (hasPrototypePollution(obj[key])) return true;
    }
  }
  return false;
}

/**
 * Sanitasi string rekursif untuk mencegah stored XSS (strip tag HTML).
 * Jangan sentuh field sandi agar karakter khusus sandi tidak rusak.
 */
function sanitizeStrings(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  // Field password tidak disentuh agar karakter khusus tidak rusak.
  // Field body & answer (markdown) disanitasi oleh renderer markdown menggunakan sanitize-html.
  const exemptFields = ['password', 'currentPassword', 'newPassword', 'token', 'body', 'answer'];

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      if (!exemptFields.includes(key)) {
        // Hapus tag HTML
        obj[key] = value.replace(/<[^>]*>?/gm, '').trim();
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitizeStrings(value);
    }
  }
  return obj;
}

/**
 * Middleware pencegahan Prototype Pollution dan Stored XSS.
 */
function sanitizeInput(req, res, next) {
  // 1. Cek Prototype Pollution pada body, query, dan params
  if (
    hasPrototypePollution(req.body) ||
    hasPrototypePollution(req.query) ||
    hasPrototypePollution(req.params)
  ) {
    return next(
      new AppError(
        'Permintaan ditolak karena terindikasi mengandung parameter berbahaya (prototype pollution).',
        'VALIDATION_ERROR',
        400,
      ),
    );
  }

  // 2. Sanitasi XSS pada req.body
  if (req.body && typeof req.body === 'object') {
    sanitizeStrings(req.body);
  }

  next();
}

module.exports = sanitizeInput;
