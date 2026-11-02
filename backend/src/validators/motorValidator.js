const { z } = require('zod');

const motorQuerySchema = z.object({
  q: z.string().optional(),
  types: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    }),
  brands: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    }),
  transmission: z.string().optional(),
  minPrice: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? Math.max(0, parseInt(val, 10) || 0) : 0)),
  maxPrice: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? Math.max(0, parseInt(val, 10) || 0) : 0)),
  minRating: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? Math.max(0, parseFloat(val) || 0) : 0)),
  onlyAvailable: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),
  sort: z.enum(['popular', 'price-asc', 'price-desc', 'rating', 'newest']).optional().default('popular'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.').optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? Math.max(1, parseInt(val, 10) || 1) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? Math.max(1, parseInt(val, 10) || 12) : 12)),
});

const motorSlugParamSchema = z.object({
  slug: z.string({ required_error: 'Slug motor wajib diisi.' }).min(1, 'Slug tidak boleh kosong.'),
});

const motorIdParamSchema = z.object({
  id: z.string({ required_error: 'ID motor wajib diisi.' }).min(1, 'ID tidak boleh kosong.'),
});

const availabilityQuerySchema = z.object({
  startDate: z.string({ required_error: 'Tanggal mulai sewa wajib diisi.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.'),
  endDate: z.string({ required_error: 'Tanggal selesai sewa wajib diisi.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.'),
});

module.exports = {
  motorQuerySchema,
  motorSlugParamSchema,
  motorIdParamSchema,
  availabilityQuerySchema,
};
