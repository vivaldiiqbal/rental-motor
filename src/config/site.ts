/** Konfigurasi situs: ubah nama brand, kontak, dan aturan sewa di sini saja. */
export const site = {
  name: 'RodaKita',
  tagline: 'Sewa motor mudah, harga jelas, tanpa ribet',
  email: 'halo@rodakita.id',
  phone: '+62 812-3456-7890',
  /** Format internasional tanpa tanda + untuk tautan wa.me */
  whatsapp: '6281234567890',
  address: 'Jl. Raya Kuta No. 88, Kuta, Badung, Bali 80361',
  mapQuery: 'Jl. Raya Kuta, Kuta, Badung, Bali',
  openingHours: [
    { label: 'Senin - Jumat', value: '07.00 - 20.00' },
    { label: 'Sabtu - Minggu', value: '08.00 - 18.00' },
  ],
  rental: {
    minDays: 1,
    maxDays: 30,
    /** Denda keterlambatan per jam sebagai persen dari harga harian */
    lateFeePercentPerHour: 10,
    /** Batas pembatalan gratis (jam sebelum mulai sewa) */
    freeCancelHours: 24,
    minAge: 17,
    requirements: [
      'KTP asli yang masih berlaku',
      'SIM C yang masih berlaku',
      'Berusia minimal 17 tahun',
      'Membayar deposit yang dikembalikan saat motor dikembalikan',
    ],
  },
} as const;
