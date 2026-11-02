const { pool } = require('../../../db/pool');
const { mapReturn } = require('./mappers');
const { handlePgError } = require('./errors');

const returnRepo = {
  async findByBookingId(bookingId, client = null) {
    if (bookingId === null || bookingId === undefined || isNaN(Number(bookingId))) return null;
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT br.*, u.name AS received_by_name
         FROM booking_returns br
         LEFT JOIN users u ON u.id = br.received_by
         WHERE br.booking_id = $1`,
        [Number(bookingId)],
      );
      return res.rows.length > 0 ? mapReturn(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const page = Math.max(1, Number(paging.page) || 1);
      const limit = Math.max(1, Number(paging.limit) || 100);
      const offset = (page - 1) * limit;

      const res = await db.query(
        `SELECT br.*, u.name AS received_by_name
         FROM booking_returns br
         LEFT JOIN users u ON u.id = br.received_by
         ORDER BY br.returned_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return res.rows.map(mapReturn);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(payload, client = null) {
    const db = client || pool;
    try {
      const bookingId = Number(payload.bookingId);
      const odometerEnd = Number(payload.odometerEnd ?? payload.endOdometer ?? 0);
      const fuelEnd = String(payload.fuelEnd ?? payload.finalFuel ?? 'penuh').toLowerCase();
      const notes = payload.notes ?? '';
      const returnedAt = payload.returnedAt ?? payload.actualReturn ?? new Date();
      const lateMinutes = Math.max(0, Number(payload.lateMinutes ?? 0));
      const lateFee = Math.max(0, Number(payload.lateFee ?? 0));
      const damageFee = Math.max(0, Number(payload.damageFee ?? 0));
      const otherFee = Math.max(0, Number(payload.otherFee ?? 0));
      const depositSnapshot = Math.max(0, Number(payload.depositSnapshot ?? payload.deposit ?? 200000));
      const totalDeductions = lateFee + damageFee + otherFee;
      const depositRefund = payload.depositRefund !== undefined
        ? Math.max(0, Number(payload.depositRefund))
        : Math.max(0, depositSnapshot - totalDeductions);
      const amountDue = payload.amountDue !== undefined
        ? Math.max(0, Number(payload.amountDue))
        : Math.max(0, totalDeductions - depositSnapshot);

      const depositRefundedAt = payload.depositRefundedAt || null;
      const depositRefundedBy = payload.depositRefundedBy
        ? Number(payload.depositRefundedBy)
        : null;
      const receivedBy = payload.receivedById
        ? Number(payload.receivedById)
        : (typeof payload.receivedBy === 'number' ? Number(payload.receivedBy) : null);

      const res = await db.query(
        `INSERT INTO booking_returns (
           booking_id, odometer_end, fuel_end, notes, returned_at,
           late_minutes, late_fee, damage_fee, other_fee,
           deposit_snapshot, deposit_refund, amount_due,
           deposit_refunded_at, deposit_refunded_by, received_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          bookingId,
          odometerEnd,
          fuelEnd,
          notes,
          returnedAt,
          lateMinutes,
          lateFee,
          damageFee,
          otherFee,
          depositSnapshot,
          depositRefund,
          amountDue,
          depositRefundedAt,
          depositRefundedBy,
          receivedBy,
        ],
      );

      const row = res.rows[0];
      if (typeof payload.receivedBy === 'string' && payload.receivedBy) {
        row.received_by_name = payload.receivedBy;
      }
      return mapReturn(row);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateDepositRefundStatus(bookingId, patch = {}, client = null) {
    const db = client || pool;
    try {
      const refundedAt = patch.depositRefundedAt || new Date();
      const refundedBy = patch.depositRefundedBy ? Number(patch.depositRefundedBy) : null;
      const res = await db.query(
        `UPDATE booking_returns
         SET deposit_refunded_at = $1,
             deposit_refunded_by = $2
         WHERE booking_id = $3
           AND deposit_refunded_at IS NULL
           AND deposit_refund > 0
         RETURNING *`,
        [refundedAt, refundedBy, Number(bookingId)],
      );
      return res.rows.length > 0 ? mapReturn(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = returnRepo;
