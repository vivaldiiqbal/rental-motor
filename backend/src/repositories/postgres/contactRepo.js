const { pool } = require('../../../db/pool');
const { mapContact } = require('./mappers');
const { handlePgError } = require('./errors');

const contactRepo = {
  async create(contactData, client = null) {
    const db = client || pool;
    try {
      const {
        id,
        name,
        email,
        subject = '',
        message,
        ip = null,
      } = contactData;

      let query;
      let params;

      if (id !== undefined && id !== null) {
        query = `
          INSERT INTO contact_messages (id, name, email, subject, message, ip, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, now())
          RETURNING *`;
        params = [Number(id), name, email.toLowerCase(), subject || 'Pertanyaan Umum', message, ip];
      } else {
        query = `
          INSERT INTO contact_messages (name, email, subject, message, ip, created_at)
          VALUES ($1, $2, $3, $4, $5, now())
          RETURNING *`;
        params = [name, email.toLowerCase(), subject || 'Pertanyaan Umum', message, ip];
      }

      const res = await db.query(query, params);
      return mapContact(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(paging = {}, client = null) {
    const db = client || pool;
    try {
      const countRes = await db.query('SELECT COUNT(*)::int AS total FROM contact_messages');
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 20);
      const offset = (page - 1) * limit;

      const res = await db.query(
        'SELECT * FROM contact_messages ORDER BY id DESC LIMIT $1 OFFSET $2',
        [limit, offset],
      );

      return {
        items: res.rows.map(mapContact),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM contact_messages WHERE id = $1', [Number(id)]);
      return res.rows.length > 0 ? mapContact(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async countUnread(client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT COUNT(*)::int AS count FROM contact_messages WHERE is_read = false');
      return res.rows[0].count;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async markRead(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `UPDATE contact_messages
         SET is_read = true, read_at = now()
         WHERE id = $1
         RETURNING *`,
        [Number(id)],
      );
      return res.rows.length > 0 ? mapContact(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async reply(id, replyText, repliedBy = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `UPDATE contact_messages
         SET is_read = true,
             read_at = COALESCE(read_at, now()),
             replied_at = now(),
             replied_by = $2,
             reply_message = $3
         WHERE id = $1
         RETURNING *`,
        [Number(id), repliedBy ? Number(repliedBy) : null, String(replyText || '')],
      );
      return res.rows.length > 0 ? mapContact(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = contactRepo;
