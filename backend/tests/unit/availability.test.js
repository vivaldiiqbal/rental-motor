process.env.USE_DB = 'memory';
const availabilityService = require('../../src/services/availabilityService');
const { store } = require('../../src/repositories');
const { addDays, format } = require('date-fns');

describe('Unit Test: Availability Service', () => {
  beforeEach(() => {
    store.resetToSeed();
  });

  test('Motor dengan status maintenance tidak tersedia meskipun tanpa booking', async () => {
    // Motor 10 (Kawasaki KLX 150) berstatus maintenance di seed
    const isAvailable = await availabilityService.isMotorAvailable(10, '2027-01-01', '2027-01-03');
    expect(isAvailable).toBe(false);
  });

  test('Motor tersedia pada rentang tanggal jauh di masa depan yang belum dibooking', async () => {
    // Motor 1 (Honda Beat) berstatus available
    const isAvailable = await availabilityService.isMotorAvailable(1, '2028-05-10', '2028-05-15');
    expect(isAvailable).toBe(true);
  });

  test('Mendeteksi jadwal bentrok saat ada booking berstatus confirmed atau active', async () => {
    const today = new Date();
    const startStr = format(addDays(today, 40), 'yyyy-MM-dd');
    const endStr = format(addDays(today, 43), 'yyyy-MM-dd');

    // Tambah booking uji
    await store.withLock(async (data) => {
      data.bookings.push({
        id: 9999,
        motorId: 1,
        startDate: startStr,
        endDate: endStr,
        status: 'confirmed',
      });
    });

    // Cek bentrok persis di tanggal yang sama
    const conflictExact = await availabilityService.isMotorAvailable(1, startStr, endStr);
    expect(conflictExact).toBe(false);

    // Cek tanggal yang overlap di tengah
    const overlapMid = await availabilityService.isMotorAvailable(
      1,
      format(addDays(today, 39), 'yyyy-MM-dd'),
      format(addDays(today, 41), 'yyyy-MM-dd'),
    );
    expect(overlapMid).toBe(false);

    // Cek tanggal setelah booking selesai (harus available)
    const afterBooking = await availabilityService.isMotorAvailable(
      1,
      format(addDays(today, 44), 'yyyy-MM-dd'),
      format(addDays(today, 46), 'yyyy-MM-dd'),
    );
    expect(afterBooking).toBe(true);
  });

  test('Semantik Batas [start, end): Tanggal kembali boleh sama dengan tanggal ambil booking lain', async () => {
    // Existing booking: 2026-11-10 s/d 2026-11-13 (motor 1)
    await store.withLock(async (data) => {
      data.bookings.push({
        id: 8888,
        motorId: 1,
        startDate: '2026-11-10',
        endDate: '2026-11-13',
        status: 'confirmed',
      });
    });

    // Booking baru: mulai tepat di tanggal kembali booking sebelumnya (2026-11-13 s/d 2026-11-15)
    // Dalam semantik [start, end), ini TIDAK bentrok dan harus diizinkan (available = true)
    const canPickupOnSameReturnDate = await availabilityService.isMotorAvailable(1, '2026-11-13', '2026-11-15');
    expect(canPickupOnSameReturnDate).toBe(true);

    // Booking baru: selesai tepat di tanggal ambil booking berikutnya (2026-11-07 s/d 2026-11-10)
    // Dalam semantik [start, end), ini TIDAK bentrok dan harus diizinkan (available = true)
    const canReturnOnSamePickupDate = await availabilityService.isMotorAvailable(1, '2026-11-07', '2026-11-10');
    expect(canReturnOnSamePickupDate).toBe(true);
  });

  test('Blok Servis: Motor tidak tersedia jika beririsan dengan jadwal servis berkala', async () => {
    await store.withLock(async (data) => {
      data.serviceBlocks.push({
        id: 7777,
        motorId: 1,
        startDate: '2026-12-01',
        endDate: '2026-12-05',
        status: 'scheduled',
        reason: 'Servis rutin berkala',
      });
    });

    // Rentang yang beririsan dengan jadwal servis harus ditolak (available = false)
    const conflictService = await availabilityService.isMotorAvailable(1, '2026-12-02', '2026-12-04');
    expect(conflictService).toBe(false);

    // Di luar jadwal servis harus tetap tersedia
    const outsideService = await availabilityService.isMotorAvailable(1, '2026-12-06', '2026-12-08');
    expect(outsideService).toBe(true);
  });
});

