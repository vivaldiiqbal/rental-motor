const { pool } = require('../../../db/pool');
const { mapBookingNote } = require('./mappers');
const { handlePgError } = require('./errors');

const bookingNoteRepo = {
  async findByBookingId(bookingId, client = null) {
    if (bookingId === null || bookingId === undefined || isNaN(Number(bookingId))) return [];
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT bn.*, u.name AS author_name, u.role AS author_role
         FROM booking_notes bn
         LEFT JOIN users u ON u.id = bn.author_id
         WHERE bn.booking_id = $1
         ORDER BY bn.created_at ASC, bn.id ASC`,
        [Number(bookingId)],
      );
      return res.rows.map(mapBookingNote);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(payload, client = null) {
    const db = client || pool;
    try {
      const bookingId = Number(payload.bookingId);
      const authorId = payload.authorId ? Number(payload.authorId) : null;
      const note = String(payload.note || '').trim().slice(0, 1000);

      const res = await db.query(
        `INSERT INTO booking_notes (booking_id, author_id, note, created_at)
         VALUES ($1, $2, $3, now())
         RETURNING *`,
        [bookingId, authorId, note],
      );

      const row = res.rows[0];
      if (payload.authorName) row.author_name = payload.authorName;
      if (payload.authorRole) row.author_role = payload.authorRole;
      return mapBookingNote(row);
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = bookingNoteRepo;
