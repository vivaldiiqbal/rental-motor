/**
 * Format response standar aplikasi RodaKita.
 * Menjamin tidak pernah mengirim response ganda (res.headersSent check).
 */

function successResponse(res, { data, meta, message, statusCode = 200, ...extra }) {
  if (res.headersSent) return;

  const payload = {
    success: true,
    ...extra,
  };

  if (message) {
    payload.message = message;
  }

  if (data !== undefined) {
    payload.data = data;
  }

  if (meta) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

function errorResponse(res, { code = 'INTERNAL_ERROR', message = 'Terjadi kesalahan pada server.', details = null, statusCode = 500, requestId = null }) {
  if (res.headersSent) return;

  const reqId = requestId || (res.getHeader ? res.getHeader('X-Request-Id') : undefined);

  // Jangan membocorkan detail internal pada error 500 di environment production
  const isProd = process.env.NODE_ENV === 'production';
  const safeMessage = (statusCode >= 500 && isProd) ? 'Terjadi kesalahan internal pada server.' : message;
  const safeDetails = (statusCode >= 500 && isProd) ? null : details;

  const errorObj = {
    code,
    message: safeMessage,
  };

  if (safeDetails !== null && safeDetails !== undefined) {
    if (Array.isArray(safeDetails)) {
      if (safeDetails.length > 0) errorObj.details = safeDetails;
    } else if (typeof safeDetails === 'object') {
      if (Object.keys(safeDetails).length > 0) errorObj.details = safeDetails;
    } else {
      errorObj.details = safeDetails;
    }
  }

  if (reqId) {
    errorObj.requestId = reqId;
  }

  return res.status(statusCode).json({
    success: false,
    error: errorObj,
  });
}

module.exports = {
  successResponse,
  errorResponse,
};
