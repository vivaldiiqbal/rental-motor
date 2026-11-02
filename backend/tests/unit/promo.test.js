process.env.USE_DB = 'memory';
const promoService = require('../../src/services/promoService');
const { store } = require('../../src/repositories');

describe('Unit Test: Promo Service', () => {
  beforeEach(() => {
    store.resetToSeed();
  });

  test('Mengambil daftar promo aktif', async () => {
    const list = await promoService.getActivePromos();
    expect(list).toBeInstanceOf(Array);
    expect(list.length).toBeGreaterThan(0);
  });

  test('Validasi promo persentase berhasil dengan perhitungan diskon yang tepat', async () => {
    // PROMO HEMAT10: diskon 10%
    const result = await promoService.validatePromo({
      code: 'HEMAT10',
      subtotal: 200000,
      days: 3,
    });

    expect(result.valid).toBe(true);
    expect(result.discount).toBe(20000); // 10% dari 200.000
    expect(result.finalSubtotal).toBe(180000);
    expect(result.promo.code).toBe('HEMAT10');
  });

  test('Menolak promo yang tidak terdaftar', async () => {
    await expect(
      promoService.validatePromo({
        code: 'KODETIDAKADA',
        subtotal: 200000,
        days: 2,
      }),
    ).rejects.toThrow("Kode promo 'KODETIDAKADA' tidak ditemukan.");
  });

  test('Menolak jika durasi sewa kurang dari minimal hari yang disyaratkan', async () => {
    // Tambah promo dengan syarat minDays = 3
    await store.withLock(async (data) => {
      data.promos.push({
        id: 999,
        code: 'MIN3HARI',
        type: 'fixed',
        value: 20000,
        minDays: 3,
        validUntil: '2030-01-01',
        quota: 10,
        isActive: true,
      });
    });

    await expect(
      promoService.validatePromo({
        code: 'MIN3HARI',
        subtotal: 150000,
        days: 2, // < 3 hari
      }),
    ).rejects.toThrow('memerlukan durasi sewa minimal 3 hari');
  });

  test('Menolak jika nilai subtotal kurang dari minSubtotal yang disyaratkan', async () => {
    await store.withLock(async (data) => {
      data.promos.push({
        id: 998,
        code: 'MINBELANJA',
        type: 'fixed',
        value: 25000,
        minSubtotal: 300000,
        validUntil: '2030-01-01',
        quota: 10,
        isActive: true,
      });
    });

    await expect(
      promoService.validatePromo({
        code: 'MINBELANJA',
        subtotal: 200000, // < 300.000
        days: 3,
      }),
    ).rejects.toThrow('memerlukan nilai sewa minimal');
  });

  test('Menolak kode promo yang sudah kedaluwarsa', async () => {
    await store.withLock(async (data) => {
      data.promos.push({
        id: 997,
        code: 'EXPIREDCODE',
        type: 'percent',
        value: 10,
        validUntil: '2020-01-01', // masa lalu
        quota: 10,
        isActive: true,
      });
    });

    await expect(
      promoService.validatePromo({
        code: 'EXPIREDCODE',
        subtotal: 200000,
        days: 2,
      }),
    ).rejects.toThrow('sudah kedaluwarsa');
  });

  test('Menolak jika kuota kode promo telah habis (quota <= 0)', async () => {
    await store.withLock(async (data) => {
      data.promos.push({
        id: 996,
        code: 'HABISKUOTA',
        type: 'percent',
        value: 10,
        validUntil: '2030-01-01',
        quota: 0,
        isActive: true,
      });
    });

    await expect(
      promoService.validatePromo({
        code: 'HABISKUOTA',
        subtotal: 200000,
        days: 2,
      }),
    ).rejects.toThrow('telah habis');
  });

  test('Diskon promo persentase tidak melebihi maxDiscount yang ditentukan', async () => {
    await store.withLock(async (data) => {
      data.promos.push({
        id: 995,
        code: 'MAXCAP',
        type: 'percent',
        value: 50, // 50%
        maxDiscount: 50000, // Maksimal 50.000
        validUntil: '2030-01-01',
        quota: 10,
        isActive: true,
      });
    });

    const result = await promoService.validatePromo({
      code: 'MAXCAP',
      subtotal: 500000, // 50% = 250.000, harus dibatasi ke 50.000
      days: 3,
    });

    expect(result.discount).toBe(50000);
  });
});
