const { v4: uuidv4 } = require('uuid');

/**
 * Middleware untuk menyertakan X-Request-Id pada request dan response header.
 */
function requestIdMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || uuidv4();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}

module.exports = requestIdMiddleware;
