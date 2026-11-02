const AppError = require('../utils/AppError');

/**
 * Pastikan skema Zod menolak field tak dikenal (strict mode).
 */
function makeStrict(schema) {
  if (schema && typeof schema.strict === 'function') {
    return schema.strict();
  }
  return schema;
}

/**
 * Middleware validasi berbasis Zod.
 * Menolak field tak dikenal untuk mencegah parameter tampering.
 * @param {import('zod').ZodTypeAny | { body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schema
 */
function validate(schema) {
  return async (req, res, next) => {
    try {
      if (schema.safeParse) {
        // Skema langsung memvalidasi req.body (dijadikan strict agar menolak field tak dikenal)
        const strictSchema = makeStrict(schema);
        const result = strictSchema.safeParse(req.body);
        if (!result.success) {
          const details = result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          }));
          return next(new AppError('Validasi data gagal.', 'VALIDATION_ERROR', 422, details));
        }
        req.body = result.data;
      } else {
        // Skema terpisah untuk body, query, atau params
        if (schema.body) {
          const strictBodySchema = makeStrict(schema.body);
          const result = strictBodySchema.safeParse(req.body);
          if (!result.success) {
            const details = result.error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            }));
            return next(new AppError('Validasi data gagal.', 'VALIDATION_ERROR', 422, details));
          }
          req.body = result.data;
        }

        if (schema.query) {
          const result = schema.query.safeParse(req.query);
          if (!result.success) {
            const details = result.error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            }));
            return next(new AppError('Validasi parameter query gagal.', 'VALIDATION_ERROR', 422, details));
          }
          req.query = result.data;
        }

        if (schema.params) {
          const result = schema.params.safeParse(req.params);
          if (!result.success) {
            const details = result.error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            }));
            return next(new AppError('Validasi parameter URL gagal.', 'VALIDATION_ERROR', 422, details));
          }
          req.params = result.data;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validate;
