process.env.USE_DB = 'memory';
const bookingService = require('../../src/services/bookingService');
const { store } = require('../../src/repositories');
const { addDays, format } = require('date-fns');
const env = require('../../src/config/env');

describe('Unit Test: Booking Business Rules & Race Condition Protection', () => {
  beforeEach(() => {
    store.resetToSeed();
    env.REQUIRE_VERIFIED_DOCS = false;
  });

  const validRenter = {
    name: 'Pengguna Uji',
    phone: '081234567890',
    email: 'test@example.com',
    idNumber: '3201234567890001',
    notes: 'Unit test',
  };

  test('Menolak booking dengan tanggal di masa lampau', async () => {
    await expect(
      bookingService.createBooking(
        {
          motorId: 1,
          startDate: '2020-01-01',
          endDate: '2020-01-03',
          pickup: 'store',
          payment: 'transfer',
          renter: validRenter,
        },
        1,
      ),
    ).rejects.toThrow('Tanggal mulai sewa tidak boleh di masa lalu.');
  });

  test('Menolak booking jika tanggal kembali sebelum atau sama dengan tanggal ambil', async () => {
    const today = new Date();
    const futureDate = format(addDays(today, 10), 'yyyy-MM-dd');

    await expect(
      bookingService.createBooking(
        {
          motorId: 1,
          startDate: futureDate,
          endDate: futureDate,
          pickup: 'store',
          payment: 'transfer',
          renter: validRenter,
        },
        1,
      ),
    ).rejects.toThrow('Tanggal kembali harus setelah tanggal ambil.');
  });

  test('Menolak booking dengan tanggal mustahil (30 Februari)', async () => {
    await expect(
      bookingService.createBooking(
        {
          motorId: 1,
          startDate: '2026-02-30',
          endDate: '2026-03-02',
          pickup: 'store',
          payment: 'transfer',
          renter: validRenter,
        },
        1,
      ),
    ).rejects.toThrow('Format tanggal sewa harus YYYY-MM-DD dan merupakan tanggal kalender yang valid.');
  });

  test('Menolak pemesanan lebih dari 180 hari ke depan', async () => {
    const today = new Date();
    const startFar = format(addDays(today, 190), 'yyyy-MM-dd');
    const endFar = format(addDays(today, 193), 'yyyy-MM-dd');

    await expect(
      bookingService.createBooking(
        {
          motorId: 1,
          startDate: startFar,
          endDate: endFar,
          pickup: 'store',
          payment: 'transfer',
          renter: validRenter,
        },
        1,
      ),
    ).rejects.toThrow('Pemesanan sewa maksimal dapat dilakukan hingga 180 hari ke depan.');
  });

  test('Menolak booking dengan durasi sewa melebihi 30 hari', async () => {
    const today = new Date();
    const start = format(addDays(today, 5), 'yyyy-MM-dd');
    const end = format(addDays(today, 45), 'yyyy-MM-dd'); // 40 hari

    await expect(
      bookingService.createBooking(
        {
          motorId: 1,
          startDate: start,
          endDate: end,
          pickup: 'store',
          payment: 'transfer',
          renter: validRenter,
        },
        1,
      ),
    ).rejects.toThrow('Durasi sewa maksimal 30 hari');
  });

  test('Proteksi Mutex Atomik: Dua booking bersamaan untuk motor dan tanggal yang sama tidak boleh double-book', async () => {
    const today = new Date();
    const start = format(addDays(today, 60), 'yyyy-MM-dd');
    const end = format(addDays(today, 63), 'yyyy-MM-dd');

    const bookingInput = {
      motorId: 2, // Honda Scoopy
      startDate: start,
      endDate: end,
      pickup: 'store',
      payment: 'transfer',
      renter: validRenter,
    };

    // Jalankan 2 pemesanan secara konkruen (Promise.allSettled)
    const results = await Promise.allSettled([
      bookingService.createBooking(bookingInput, 1),
      bookingService.createBooking(bookingInput, 2),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Tepat satu pemesanan harus berhasil, dan satu pemesanan harus ditolak dengan BOOKING_CONFLICT
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('BOOKING_CONFLICT');
    // Error details harus menyertakan conflictDates dan nextAvailable
    expect(rejected[0].reason.details).toHaveProperty('conflictDates');
    expect(rejected[0].reason.details).toHaveProperty('nextAvailable');
  });

  test('Dokumen: Jika REQUIRE_VERIFIED_DOCS=true, user belum terverifikasi ditolak dengan 403 DOCS_NOT_VERIFIED', async () => {
    env.REQUIRE_VERIFIED_DOCS = true;
    const today = new Date();
    const start = format(addDays(today, 15), 'yyyy-MM-dd');
    const end = format(addDays(today, 17), 'yyyy-MM-dd');

    // User ID 2 (Budi) dokumennya belum diverifikasi (ktp: 'not_uploaded')
    await expect(
      bookingService.createBooking(
        {
          motorId: 1,
          startDate: start,
          endDate: end,
          pickup: 'store',
          payment: 'transfer',
          renter: validRenter,
        },
        2, // User Budi
      ),
    ).rejects.toMatchObject({
      code: 'DOCS_NOT_VERIFIED',
      statusCode: 403,
    });
  });

  test('Pembatalan Booking: Pelanggan ditolak batal jika sudah confirmed, admin berhak dengan keputusan refund', async () => {
    // Buat booking confirmed di masa depan (> 48 jam) pada tanggal bebas
    const today = new Date();
    const start = format(addDays(today, 80), 'yyyy-MM-dd');
    const end = format(addDays(today, 82), 'yyyy-MM-dd');

    const created = await bookingService.createBooking(
      {
        motorId: 3,
        startDate: start,
        endDate: end,
        pickupTime: '10:00',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: validRenter,
      },
      1,
    );

    // Ubah ke confirmed
    const { bookingRepo } = require('../../src/repositories');
    await bookingRepo.update(created.id, { status: 'confirmed', paidAt: new Date().toISOString() });

    // 1. Pelanggan ditolak membatalkan booking yang sudah paid / confirmed
    await expect(
      bookingService.cancelBooking(created.id, 'Ubah rencana', { id: 1, role: 'customer' })
    ).rejects.toMatchObject({
      code: 'CANCELLATION_BLOCKED',
      statusCode: 400,
    });

    // 2. Admin dapat membatalkan booking berbayar dengan keputusan refund manual
    const adminCancelled = await bookingService.cancelBooking(
      created.id,
      { reason: 'Permintaan bantuan pembatalan oleh admin', refundAmount: created.total },
      { id: 99, role: 'admin', name: 'Admin RodaKita' }
    );
    expect(adminCancelled.status).toBe('cancelled');
    expect(adminCancelled.refundAmount).toBe(created.total);
    expect(adminCancelled.cancelledBy).toBe('admin');
  });

  test('Ekspor Kalender ICS: Menghasilkan berkas .ics RFC 5545 yang valid untuk booking milik sendiri', async () => {
    const today = new Date();
    const start = format(addDays(today, 100), 'yyyy-MM-dd');
    const end = format(addDays(today, 103), 'yyyy-MM-dd');

    const created = await bookingService.createBooking(
      {
        motorId: 1,
        startDate: start,
        endDate: end,
        pickup: 'store',
        payment: 'bank_transfer',
        renter: validRenter,
      },
      1,
    );

    const icsResult = await bookingService.getBookingIcs(created.id, { id: 1, role: 'customer' });
    expect(icsResult.filename).toBe(`rental-rodakita-${created.code}.ics`);
    expect(icsResult.content).toContain('BEGIN:VCALENDAR');
    expect(icsResult.content).toContain('BEGIN:VEVENT');
    expect(icsResult.content).toContain(created.code);
  });

  test('Pembatalan mengembalikan kuota promo jika pemesanan menggunakan promo', async () => {
    const today = new Date();
    const start = format(addDays(today, 110), 'yyyy-MM-dd');
    const end = format(addDays(today, 113), 'yyyy-MM-dd');

    // Buat promo uji
    await store.withLock(async (data) => {
      data.promos.push({
        id: 777,
        code: 'TESTRESTORE',
        type: 'fixed',
        value: 10000,
        quota: 5,
        validUntil: '2030-01-01',
        isActive: true,
      });
    });

    const created = await bookingService.createBooking(
      {
        motorId: 1,
        startDate: start,
        endDate: end,
        promoCode: 'TESTRESTORE',
        pickup: 'store',
        payment: 'bank_transfer',
        renter: validRenter,
      },
      1,
    );

    // Kuota berkurang jadi 4
    let promo = store.getCollection('promos').find((p) => p.code === 'TESTRESTORE');
    expect(promo.quota).toBe(4);

    // Batalkan pemesanan
    await bookingService.cancelBooking(created.id, 'Batal sewa', { id: 1, role: 'customer' });

    // Kuota harus kembali jadi 5
    promo = store.getCollection('promos').find((p) => p.code === 'TESTRESTORE');
    expect(promo.quota).toBe(5);
  });
});

