const returnService = require('../../src/services/admin/returnService');
const { settingsRepo } = require('../../src/repositories');

describe('Unit Test: Perhitungan Denda Keterlambatan (Late Fee Rules)', () => {
  const dummyBooking = {
    endDate: '2026-10-22',
    pickupTime: '09:00',
    pricePerDay: 100000,
    deposit: 200000,
  };

  beforeEach(() => {
    // Mock settingsRepo agar deterministik tanpa DB
    jest.spyOn(settingsRepo, 'getSettings').mockResolvedValue({
      lateFeeToleranceMinutes: 120, // 2 jam toleransi
      lateFeePercentPerHour: 10,     // 10% per jam = 10.000 / jam
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Kembali tepat waktu: 0 denda dan 100% deposit kembali', async () => {
    const summary = await returnService.calculateReturnSummary(
      dummyBooking,
      '2026-10-22T09:00:00+07:00'
    );

    expect(summary.isOverdue).toBe(false);
    expect(summary.lateMinutes).toBe(0);
    expect(summary.lateFee).toBe(0);
    expect(summary.depositRefund).toBe(200000);
    expect(summary.amountDue).toBe(0);
  });

  test('Kembali dalam batas toleransi (tepat 120 menit terlambat): 0 denda', async () => {
    const summary = await returnService.calculateReturnSummary(
      dummyBooking,
      '2026-10-22T11:00:00+07:00' // Tepat 120 menit terlambat
    );

    expect(summary.lateMinutes).toBe(120);
    expect(summary.isOverdue).toBe(false);
    expect(summary.lateFee).toBe(0);
    expect(summary.depositRefund).toBe(200000);
    expect(summary.amountDue).toBe(0);
  });

  test('Terlambat 1 menit melewati batas toleransi (121 menit): Kena denda 3 jam penuh (ceil)', async () => {
    const summary = await returnService.calculateReturnSummary(
      dummyBooking,
      '2026-10-22T11:01:00+07:00' // 121 menit
    );

    expect(summary.isOverdue).toBe(true);
    expect(summary.lateMinutes).toBe(121);
    expect(summary.lateHours).toBe(3); // ceil(121/60) = 3
    // 3 jam * (10% dari 100.000 = 10.000) = 30.000
    expect(summary.lateFee).toBe(30000);
    expect(summary.depositRefund).toBe(170000); // 200.000 - 30.000
    expect(summary.amountDue).toBe(0);
  });

  test('Batas per blok 24 jam: Denda jam sisa tidak boleh melebihi harga sewa harian (dailyPrice)', async () => {
    // Terlambat 15 jam -> 15 * 10.000 = 150.000, tapi batas per hari adalah dailyPrice = 100.000
    const summary = await returnService.calculateReturnSummary(
      dummyBooking,
      '2026-10-23T00:00:00+07:00' // 15 jam terlambat
    );

    expect(summary.lateHours).toBe(15);
    expect(summary.lateFee).toBe(100000); // Dibatasi maksimal dailyPrice
    expect(summary.depositRefund).toBe(100000); // 200.000 - 100.000
  });

  test('Banyak blok 24 jam: 2 hari penuh + 5 jam keterlambatan', async () => {
    // 2 hari = 48 jam + 5 jam = 53 jam
    // 2 blok penuh = 2 * 100.000 = 200.000
    // 5 jam sisa = min(100.000, 5 * 10.000) = 50.000
    // Total denda = 250.000
    const summary = await returnService.calculateReturnSummary(
      dummyBooking,
      '2026-10-24T14:00:00+07:00' // 53 jam terlambat
    );

    expect(summary.lateHours).toBe(53);
    expect(summary.lateFee).toBe(250000);
    // Deposit 200.000 dipotong habis, pelanggan kurang bayar (amountDue) 50.000
    expect(summary.depositRefund).toBe(0);
    expect(summary.amountDue).toBe(50000);
  });

  test('Kombinasi denda keterlambatan + biaya kerusakan (damageFee) + biaya lain (otherFee)', async () => {
    const summary = await returnService.calculateReturnSummary(
      dummyBooking,
      '2026-10-22T12:00:00+07:00', // 3 jam = 30.000
      100000, // damageFee (spion pecah)
      20000   // otherFee (cuci motor kotor parah)
    );

    expect(summary.lateFee).toBe(30000);
    expect(summary.damageFee).toBe(100000);
    expect(summary.otherFee).toBe(20000);
    expect(summary.totalDeduction).toBe(150000);
    expect(summary.depositRefund).toBe(50000); // 200.000 - 150.000
    expect(summary.amountDue).toBe(0);
  });
});
