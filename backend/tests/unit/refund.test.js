const { calculateCancellationRefund } = require('../../src/config/rules');
const { BOOKING_STATUS } = require('../../src/config/constants');
const clock = require('../../src/utils/clock');
const { getHoursUntil } = require('../../src/utils/dates');

describe('Unit Test: Kebijakan Refund Bertingkat (Cancellation Refund Rules)', () => {
  const totalRental = 300000;
  const deposit = 200000;

  describe('Kalkulasi Kebijakan Refund Murni (Pure Function)', () => {
    test('Booking status PENDING: 0 biaya pembatalan (bebas biaya)', () => {
      const res = calculateCancellationRefund({
        status: BOOKING_STATUS.PENDING,
        hoursUntilStart: 10,
        totalRental,
        deposit,
      });

      expect(res.cancellationFee).toBe(0);
      expect(res.refundPercentage).toBe(100);
      expect(res.refundAmount).toBe(totalRental + deposit);
    });

    test('Booking CONFIRMED > 48 jam sebelum jadwal: 100% biaya sewa dan 100% deposit', () => {
      const res = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilStart: 49,
        totalRental,
        deposit,
      });

      expect(res.refundPercentage).toBe(100);
      expect(res.cancellationFee).toBe(0);
      expect(res.refundAmount).toBe(totalRental + deposit); // 300.000 + 200.000 = 500.000
    });

    test('Booking CONFIRMED tepat 48 jam sebelum jadwal: Masuk tier 24-48 jam (50% sewa + 100% deposit)', () => {
      const res = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilStart: 48,
        totalRental,
        deposit,
      });

      expect(res.refundPercentage).toBe(50);
      expect(res.cancellationFee).toBe(150000);
      expect(res.refundAmount).toBe(150000 + deposit); // 350.000
    });

    test('Booking CONFIRMED 24 s/d 48 jam sebelum jadwal: 50% biaya sewa dan 100% deposit', () => {
      const res = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilStart: 30,
        totalRental,
        deposit,
      });

      expect(res.refundPercentage).toBe(50);
      expect(res.cancellationFee).toBe(150000);
      expect(res.refundAmount).toBe(350000);
    });

    test('Booking CONFIRMED < 24 jam sebelum jadwal: Biaya sewa hangus (0%), deposit kembali 100%', () => {
      const res = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilStart: 12,
        totalRental,
        deposit,
      });

      expect(res.refundPercentage).toBe(0);
      expect(res.cancellationFee).toBe(totalRental);
      expect(res.refundAmount).toBe(deposit); // 200.000
    });

    test('Booking dengan status selain pending/confirmed: Refund 0', () => {
      const res = calculateCancellationRefund({
        status: BOOKING_STATUS.COMPLETED,
        hoursUntilStart: 10,
        totalRental,
        deposit,
      });

      expect(res.refundAmount).toBe(0);
      expect(res.refundPercentage).toBe(0);
    });
  });

  describe('Integrasi dengan Jam Terkendali (Simulated Time Engine)', () => {
    const pickupDateTime = '2026-11-01T09:00:00';

    afterEach(() => {
      clock.resetSystemTime();
    });

    test('Waktu sistem disimulasikan 72 jam sebelum pickup -> Menghasilkan tier >48 jam (100% refund)', () => {
      // 72 jam sebelum 2026-11-01 09:00 adalah 2026-10-29 09:00
      clock.setSystemTime('2026-10-29T09:00:00');
      const hours = getHoursUntil(pickupDateTime);
      expect(hours).toBe(72);

      const refund = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilStart: hours,
        totalRental,
        deposit,
      });
      expect(refund.refundPercentage).toBe(100);
      expect(refund.refundAmount).toBe(totalRental + deposit);
    });

    test('Waktu sistem disimulasikan 36 jam sebelum pickup -> Menghasilkan tier 24-48 jam (50% refund)', () => {
      // 36 jam sebelum 2026-11-01 09:00 adalah 2026-10-30 21:00
      clock.setSystemTime('2026-10-30T21:00:00');
      const hours = getHoursUntil(pickupDateTime);
      expect(hours).toBe(36);

      const refund = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilStart: hours,
        totalRental,
        deposit,
      });
      expect(refund.refundPercentage).toBe(50);
      expect(refund.refundAmount).toBe(350000);
    });

    test('Waktu sistem disimulasikan 6 jam sebelum pickup -> Menghasilkan tier <24 jam (0% sewa, deposit 100%)', () => {
      // 6 jam sebelum 2026-11-01 09:00 adalah 2026-11-01 03:00
      clock.setSystemTime('2026-11-01T03:00:00');
      const hours = getHoursUntil(pickupDateTime);
      expect(hours).toBe(6);

      const refund = calculateCancellationRefund({
        status: BOOKING_STATUS.CONFIRMED,
        hoursUntilStart: hours,
        totalRental,
        deposit,
      });
      expect(refund.refundPercentage).toBe(0);
      expect(refund.refundAmount).toBe(deposit);
    });
  });
});
