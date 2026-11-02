const { z } = require('zod');
const { isValidIndonesianPhone, normalizeIndonesianPhone } = require('../utils/phone');

const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const registerSchema = z.object({
  name: z
    .string({ required_error: 'Nama lengkap wajib diisi.' })
    .trim()
    .min(3, 'Nama minimal 3 karakter.')
    .max(80, 'Nama maksimal 80 karakter.'),
  email: z
    .string({ required_error: 'Email wajib diisi.' })
    .trim()
    .email('Format email tidak valid.')
    .transform((val) => val.toLowerCase()),
  phone: z
    .string({ required_error: 'Nomor telepon wajib diisi.' })
    .trim()
    .refine((val) => isValidIndonesianPhone(val), {
      message: 'Nomor telepon tidak valid. Gunakan format 08xx atau +628xx (9-14 digit).',
    })
    .transform((val) => normalizeIndonesianPhone(val)),
  password: z
    .string({ required_error: 'Kata sandi wajib diisi.' })
    .min(8, 'Kata sandi minimal 8 karakter.')
    .regex(passwordPattern, 'Kata sandi harus mengandung kombinasi huruf dan angka.'),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi.' })
    .trim()
    .email('Format email tidak valid.')
    .transform((val) => val.toLowerCase()),
  password: z.string({ required_error: 'Kata sandi wajib diisi.' }).min(1, 'Kata sandi tidak boleh kosong.'),
});

const updateMeSchema = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter.').max(80, 'Nama maksimal 80 karakter.').optional(),
  phone: z
    .string()
    .trim()
    .refine((val) => isValidIndonesianPhone(val), {
      message: 'Nomor telepon tidak valid.',
    })
    .transform((val) => normalizeIndonesianPhone(val))
    .optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().min(2, 'Nama kontak darurat minimal 2 karakter.').optional(),
      phone: z
        .string()
        .trim()
        .refine((val) => !val || isValidIndonesianPhone(val), {
          message: 'Nomor telepon kontak darurat tidak valid.',
        })
        .transform((val) => (val ? normalizeIndonesianPhone(val) : ''))
        .optional(),
    })
    .optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string({ required_error: 'Kata sandi saat ini wajib diisi.' }).min(1, 'Kata sandi saat ini wajib diisi.'),
  newPassword: z
    .string({ required_error: 'Kata sandi baru wajib diisi.' })
    .min(8, 'Kata sandi baru minimal 8 karakter.')
    .regex(passwordPattern, 'Kata sandi baru harus mengandung kombinasi huruf dan angka.'),
});

const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi.' })
    .trim()
    .email('Format email tidak valid.')
    .transform((val) => val.toLowerCase()),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateMeSchema,
  updatePasswordSchema,
  forgotPasswordSchema,
};
