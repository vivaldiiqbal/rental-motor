const { errorResponse } = require('../utils/response');

function notFound(req, res) {
  return errorResponse(res, {
    code: 'NOT_FOUND',
    message: `Endpoint '${req.method} ${req.originalUrl}' tidak ditemukan pada server RodaKita.`,
    statusCode: 404,
    requestId: req.id,
  });
}

module.exports = notFound;
