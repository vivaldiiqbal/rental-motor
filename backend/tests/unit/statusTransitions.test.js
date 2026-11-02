const { isValidStatusTransition, BOOKING_TRANSITIONS, calculateCancellationRefund } = require('../../src/config/rules');
const { BOOKING_STATUS } = require('../../src/config/constants');

describe('Unit Test: Aturan Transisi Status & Kebijakan Refund Pembatalan', () => {
  describe('Aturan Transisi Status Pemesanan', () => {
    test('Transisi valid: pending -> confirmed, cancelled, expired', () => {
      expect(isValidStatusTransition(BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED)).toBe(true);
      expect(isValidStatusTransition(BOOKING_STATUS.PENDING, BOOKING_STATUS.CANCELLED)).toBe(true);
      expect(isValidStatusTransition(BOOKING_STATUS.PENDING, BOOKING_STATUS.EXPIRED)).toBe(true);
    });

    test('Transisi valid: confirmed -> active, cancelled', () => {
      expect(isValidStatusTransition(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE)).toBe(true);
      expect(isValidStatusTransition(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED)).toBe(true);
    });

    test('Transisi valid: active -> completed', () => {
      expect(isValidStatusTransition(BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED)).toBe(true);
    });

    test('Transisi tidak valid: completed atau cancelled tidak boleh berubah ke status lain (terminal)', () => {
      expect(isValidStatusTransition(BOOKING_STATUS.COMPLETED, BOOKING_STATUS.ACTIVE)).toBe(false);
      expect(isValidStatusTransition(BOOKING_STATUS.COMPLETED, BOOKING_STATUS.PENDING)).toBe(false);
      expect(isValidStatusTransition(BOOKING_STATUS.CANCELLED, BOOKING_STATUS.CONFIRMED)).toBe(false);
      expect(isValidStatusTransition(BOOKING_STATUS.CANCELLED, BOOKING_STATUS.ACTIVE)).toBe(false);
    });

    test('Transisi tidak valid: active tidak boleh kembali ke pending atau confirmed', () => {
      expect(isValidStatusTransition(BOOKING_STATUS.ACTIVE, BOOKING_STATUS.PENDING)).toBe(false);
      expect(isValidStatusTransition(BOOKING_STATUS.ACTIVE, BOOKING_STATUS.CONFIRMED)).toBe(false);
    });
  });

  describe('Aturan Refund Pembatalan Berjenjang', () => {
    const rentalAmount = 300000;
    const depositAmount = 200000;
    const totalAmount = rentalAmount + depositAmount; // 500.000

    test('Status pending: Selalu 100% refund, biaya pembatalan 0', () => {
      const result = calculateCancellationRefund({
        status: BOOKING_STATUS.PENDING,
        hoursUntilPickup: 10,
        totalRental: rentalAmount,
        deposit: depositAmount,
      });

      expect(result.refundPercentage).toBe(100);
      expect(result.cancellationFee).toBe(0);
      expect(result.refundAmount).toBe(totalAmount);
    });

    test('Status confirmed > 48 jam sebelum jadwal: 100% refund sewa + 100% deposit', () => {
      const result = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilPickup: 72, // 3 hari
        totalRental: rentalAmount,
        deposit: depositAmount,
      });

      expect(result.refundPercentage).toBe(100);
      expect(result.cancellationFee).toBe(0);
      expect(result.refundAmount).toBe(totalAmount);
    });

    test('Status confirmed 24 - 48 jam sebelum jadwal: 50% refund sewa + 100% deposit', () => {
      const result = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilPickup: 30, // Antara 24 dan 48 jam
        totalRental: rentalAmount,
        deposit: depositAmount,
      });

      expect(result.refundPercentage).toBe(50);
      // Biaya pembatalan = 50% dari 300.000 = 150.000
      expect(result.cancellationFee).toBe(150000);
      // Refund = 150.000 (sewa) + 200.000 (deposit selalu utuh) = 350.000
      expect(result.refundAmount).toBe(350000);
    });

    test('Status confirmed < 24 jam sebelum jadwal: 0% refund sewa + 100% deposit', () => {
      const result = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilPickup: 12, // Kurang dari 24 jam
        totalRental: rentalAmount,
        deposit: depositAmount,
      });

      expect(result.refundPercentage).toBe(0);
      // Biaya pembatalan = 100% dari biaya sewa (300.000)
      expect(result.cancellationFee).toBe(300000);
      // Refund = 0 (sewa) + 200.000 (deposit selalu utuh) = 200.000
      expect(result.refundAmount).toBe(200000);
    });

    test('Deposit selalu dikembalikan 100% pada semua skenario pembatalan', () => {
      const resultLate = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilPickup: 1, // 1 jam sebelum sewa
        totalRental: 500000,
        deposit: 200000,
      });

      expect(resultLate.refundAmount).toBeGreaterThanOrEqual(200000);
    });
  });
});
