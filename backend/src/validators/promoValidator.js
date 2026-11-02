const { z } = require('zod');

const validatePromoSchema = z.object({
  code: z.string({ required_error: 'Kode promo wajib diisi.' }).trim().min(2, 'Kode promo tidak valid.'),
  motorId: z.union([z.number(), z.string()]).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format start harus YYYY-MM-DD.').optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format end harus YYYY-MM-DD.').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subtotal: z.number().min(0).optional(),
  days: z.number().int().min(1).optional(),
});

module.exports = {
  validatePromoSchema,
};
