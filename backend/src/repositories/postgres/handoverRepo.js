const { pool } = require('../../../db/pool');
const { mapHandover } = require('./mappers');
const { handlePgError } = require('./errors');

const handoverRepo = {
  async findByBookingId(bookingId, client = null) {
    if (bookingId === null || bookingId === undefined || isNaN(Number(bookingId))) return null;
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT bh.*, u.name AS handed_by_name
         FROM booking_handovers bh
         LEFT JOIN users u ON u.id = bh.handed_over_by
         WHERE bh.booking_id = $1`,
        [Number(bookingId)],
      );
      return res.rows.length > 0 ? mapHandover(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(payload, client = null) {
    const db = client || pool;
    try {
      const bookingId = Number(payload.bookingId);
      const odometerStart = Number(payload.odometerStart ?? payload.startOdometer ?? 0);
      const fuelStart = String(payload.fuelStart ?? payload.initialFuel ?? 'penuh').toLowerCase();
      const notes = payload.notes ?? payload.conditionNotes ?? '';
      const docsChecked = payload.documentsChecked ?? payload.originalDocsChecked ?? true;
      const depositRec = payload.depositReceived ?? true;
      const handedAt = payload.handedOverAt ?? payload.handedAt ?? new Date();
      const handedBy = payload.handedOverBy
        ? Number(payload.handedOverBy)
        : (typeof payload.handedBy === 'number' ? Number(payload.handedBy) : null);

      const res = await db.query(
        `INSERT INTO booking_handovers (
           booking_id, odometer_start, fuel_start, notes,
           documents_checked, deposit_received, handed_over_at, handed_over_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          bookingId,
          odometerStart,
          fuelStart,
          notes,
          Boolean(docsChecked),
          Boolean(depositRec),
          handedAt,
          handedBy,
        ],
      );

      const row = res.rows[0];
      if (typeof payload.handedBy === 'string' && payload.handedBy) {
        row.handed_by_name = payload.handedBy;
      }
      return mapHandover(row);
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = handoverRepo;
