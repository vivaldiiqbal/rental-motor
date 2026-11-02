const { z } = require('zod');

const contactSchema = z.object({
  name: z.string({ required_error: 'Nama wajib diisi.' }).trim().min(3, 'Nama minimal 3 karakter.').max(80, 'Nama maksimal 80 karakter.'),
  email: z.string({ required_error: 'Email wajib diisi.' }).trim().email('Format email tidak valid.'),
  subject: z.string().trim().max(150, 'Subjek maksimal 150 karakter.').optional(),
  message: z.string({ required_error: 'Pesan wajib diisi.' }).trim().min(10, 'Pesan minimal 10 karakter.').max(2000, 'Pesan maksimal 2000 karakter.'),
  website: z.string().optional(), // Honeypot field
});

module.exports = {
  contactSchema,
};
