const { motorRepo, bookingRepo, store } = require('../repositories');
const { MOTOR_STATUS } = require('../config/constants');
const { parseDate, toISODate, addDays, countDays, isOverlapping } = require('../utils/dates');

/**
 * Fungsi murni untuk mencari celah tanggal terdekat yang muat durasi sewa,
 * bebas dari seluruh rentang yang menghalangi (booking aktif dan blok servis).
 * Fungsi ini dipakai bersama oleh driver PostgreSQL maupun Memori.
 */
function findNextAvailableSlot(blockedRanges, duration, searchStartDate, maxDays = 180) {
  const durationDays = Math.max(1, duration || 1);
  const startObj = parseDate(searchStartDate) || new Date();

  for (let i = 0; i <= maxDays; i++) {
    const candStart = addDays(startObj, i);
    const candEnd = addDays(candStart, durationDays);
    const candStartStr = toISODate(candStart);
    const candEndStr = toISODate(candEnd);

    // Cek apakah interval [candStartStr, candEndStr) bertabrakan dengan rentang terblokir [b.from, b.to)
    const hasConflict = blockedRanges.some((b) =>
      isOverlapping(candStartStr, candEndStr, b.from || b.startDate, b.to || b.endDate),
    );

    if (!hasConflict) {
      return { start: candStartStr, end: candEndStr };
    }
  }

  return null;
}

class AvailabilityService {
  async hasActiveRentalNow(motorId) {
    if (process.env.USE_DB === 'postgres') {
      const { pool } = require('../../db/pool');
      const res = await pool.query(
        `SELECT 1 FROM bookings
         WHERE motorcycle_id = $1
           AND status IN ('confirmed', 'active')
           AND start_date <= (now() AT TIME ZONE 'Asia/Jakarta')::date
           AND end_date > (now() AT TIME ZONE 'Asia/Jakarta')::date
         LIMIT 1`,
        [Number(motorId)],
      );
      return res.rows.length > 0;
    }
    const today = toISODate(new Date());
    const bookings = store.getCollection ? store.getCollection('bookings') : (store.data?.bookings || []);
    return bookings.some(
      (b) => Number(b.motorId || b.motorcycleId) === Number(motorId) &&
        ['confirmed', 'active'].includes(b.status) &&
        b.startDate <= today && b.endDate > today,
    );
  }

  /**
   * Cek apakah motor bebas jadwal booking dan blok servis pada rentang tanggal yang diminta.
   * Menggunakan predikat daterange && daterange(...) agar indeks GiST terpakai.
   */
  async isMotorAvailable(motorId, startDate, endDate, excludeBookingId = null) {
    const motor = await motorRepo.findById(motorId);
    if (!motor || motor.status !== MOTOR_STATUS.AVAILABLE) {
      return false;
    }

    if (!startDate || !endDate) {
      return true;
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end <= start) {
      return false;
    }

    // 1. Cek bentrok dengan booking aktif (GiST daterange && daterange)
    const overlapping = await bookingRepo.findOverlapping(motorId, startDate, endDate, excludeBookingId);
    if (overlapping.length > 0) return false;

    // 2. Cek bentrok dengan blok servis motor (GiST daterange && daterange)
    let hasServiceConflict = false;
    const numericMotorId = Number(motorId);
    if (process.env.USE_DB === 'postgres') {
      const { pool } = require('../../db/pool');
      const res = await pool.query(
        `SELECT 1 FROM maintenance_blocks
         WHERE motorcycle_id = $1
           AND (status IS NULL OR status <> 'completed')
           AND completed_at IS NULL
           AND daterange(start_date, end_date, '[)') && daterange($2::date, $3::date, '[)')
         LIMIT 1`,
        [numericMotorId, startDate, endDate],
      );
      hasServiceConflict = res.rows.length > 0;
    } else {
      const serviceBlocks = store.getCollection('serviceBlocks');
      hasServiceConflict = serviceBlocks.some((s) => {
        if (Number(s.motorId) !== numericMotorId) return false;
        if (s.status === 'completed') return false;
        return isOverlapping(startDate, endDate, s.startDate, s.endDate);
      });
    }

    return !hasServiceConflict;
  }

  /**
   * Mengambil semua tanggal kalender yang tidak tersedia (YYYY-MM-DD[]) untuk motor ini.
   * Di PostgreSQL dieksekusi lewat generate_series() + UNION ALL + DISTINCT dalam rentang 180 hari.
   */
  async getUnavailableDates(motorId, fromDate = null, toDate = null) {
    if (bookingRepo && typeof bookingRepo.getUnavailableDates === 'function') {
      return await bookingRepo.getUnavailableDates(motorId, fromDate, toDate);
    }

    // Fallback generik
    const numericMotorId = Number(motorId);
    const today = new Date();
    const startRange = fromDate ? parseDate(fromDate) || today : today;
    const endRange = toDate ? parseDate(toDate) || addDays(today, 180) : addDays(today, 180);
    const startStr = toISODate(startRange);
    const endStr = toISODate(endRange);

    const blocked = await bookingRepo.findBlockedRanges(numericMotorId, startStr, endStr);
    const set = new Set();
    blocked.forEach((b) => {
      let cur = parseDate(b.from || b.startDate);
      const end = parseDate(b.to || b.endDate);
      if (!cur || !end) return;
      while (cur < end) {
        const d = toISODate(cur);
        if (d >= startStr && d < endStr) {
          set.add(d);
        }
        cur = addDays(cur, 1);
      }
    });

    return Array.from(set).sort();
  }

  /**
   * Cek detail ketersediaan, daftar tanggal bentrok, dan jadwal terdekat yang tersedia.
   * NextAvailable dihitung lewat fungsi murni findNextAvailableSlot() yang sama untuk kedua driver.
   */
  async checkAvailabilityWithNext(motorId, startDate, endDate) {
    const numericMotorId = Number(motorId);
    const motor = await motorRepo.findById(numericMotorId);
    if (!motor || motor.status !== MOTOR_STATUS.AVAILABLE) {
      return {
        available: false,
        conflictDates: [],
        nextAvailable: null,
      };
    }

    const isFree = await this.isMotorAvailable(numericMotorId, startDate, endDate);
    if (isFree) {
      return {
        available: true,
        conflictDates: [],
        nextAvailable: { start: startDate, end: endDate },
      };
    }

    // Tanggal bentrok spesifik pada jendela yang diminta
    const conflictDates = await this.getUnavailableDates(numericMotorId, startDate, endDate);

    // Ambil daftar rentang yang menghalangi untuk 180 hari ke depan
    const todayStr = toISODate(new Date());
    const blockedRanges = await bookingRepo.findBlockedRanges(numericMotorId, todayStr);

    const duration = Math.max(1, countDays(startDate, endDate) || 1);
    const searchStart = parseDate(startDate) || new Date();

    // Hitung celah terdekat yang muat durasi diminta dengan fungsi murni yang sama
    const nextAvailable = findNextAvailableSlot(blockedRanges, duration, searchStart, 180);

    return {
      available: false,
      conflictDates,
      nextAvailable,
    };
  }
}

const service = new AvailabilityService();
service.findNextAvailableSlot = findNextAvailableSlot;

module.exports = service;
