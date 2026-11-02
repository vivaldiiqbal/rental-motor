const { z } = require('zod');
const { isValidIndonesianPhone, normalizeIndonesianPhone } = require('../utils/phone');

const quoteSchema = z.object({
  motorId: z.union([z.number(), z.string()], { required_error: 'motorId wajib diisi.' }),
  start: z.string({ required_error: 'Tanggal mulai (start) wajib diisi.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.'),
  end: z.string({ required_error: 'Tanggal selesai (end) wajib diisi.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.'),
  addons: z.array(z.string()).optional().default([]),
  delivery: z
    .object({
      pickup: z.boolean().optional(),
      dropoff: z.boolean().optional(),
    })
    .optional()
    .default({}),
  promoCode: z.string().trim().optional(),
});

const createBookingSchema = z.object({
  motorId: z.union([z.number(), z.string()], { required_error: 'ID motor wajib diisi.' }),
  startDate: z
    .string({ required_error: 'Tanggal mulai sewa wajib diisi.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal mulai sewa harus YYYY-MM-DD.'),
  endDate: z
    .string({ required_error: 'Tanggal kembali wajib diisi.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal kembali harus YYYY-MM-DD.'),
  pickupTime: z.string().optional().default('09:00'),
  pickupLocation: z.string().optional(),
  addons: z.array(z.string()).optional().default([]),
  delivery: z
    .object({
      pickup: z.boolean().optional(),
      dropoff: z.boolean().optional(),
    })
    .optional(),
  pickup: z.enum(['store', 'delivery']).optional().default('store'),
  payment: z.enum(['bank_transfer', 'ewallet', 'qris', 'transfer', 'cash']).optional().default('bank_transfer'),
  promoCode: z.string().trim().optional(),
  renter: z
    .object({
      name: z.string().trim().min(2, 'Nama penyewa minimal 2 karakter.').max(80).optional(),
      phone: z
        .string()
        .trim()
        .refine((val) => isValidIndonesianPhone(val), {
          message: 'Nomor telepon penyewa tidak valid.',
        })
        .transform((val) => normalizeIndonesianPhone(val))
        .optional(),
      email: z.string().trim().email('Format email penyewa tidak valid.').optional(),
      idNumber: z.string().trim().optional().default(''),
      emergencyContact: z
        .object({
          name: z.string().trim().optional(),
          phone: z.string().trim().optional(),
        })
        .optional()
        .nullable(),
    })
    .optional(),
  notes: z.string().trim().max(500, 'Catatan sewa maksimal 500 karakter.').optional().default(''),
  acceptedTermsVersion: z.number().int().nonnegative().optional().nullable(),
});

const cancelBookingSchema = z.object({
  reason: z.string().trim().max(300, 'Alasan pembatalan maksimal 300 karakter.').optional(),
  version: z.number().int().positive().optional(),
  refundAmount: z.number().int().min(0).optional(),
});

module.exports = {
  quoteSchema,
  createBookingSchema,
  cancelBookingSchema,
};
