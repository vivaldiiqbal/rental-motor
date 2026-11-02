const { z } = require('zod');

const addReviewSchema = z.object({
  bookingId: z.union([z.number(), z.string()], { required_error: 'bookingId wajib diisi.' }),
  rating: z
    .number({ required_error: 'Rating bintang wajib diberikan (1-5).' })
    .int('Rating harus berupa bilangan bulat.')
    .min(1, 'Rating minimal 1 bintang.')
    .max(5, 'Rating maksimal 5 bintang.'),
  comment: z
    .string({ required_error: 'Ulasan wajib diisi.' })
    .trim()
    .min(3, 'Ulasan minimal 3 karakter.')
    .max(500, 'Ulasan maksimal 500 karakter.'),
});

module.exports = {
  addReviewSchema,
};
