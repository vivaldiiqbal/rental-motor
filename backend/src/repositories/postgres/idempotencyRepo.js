const { pool } = require('../../../db/pool');
const { handlePgError } = require('./errors');

const idempotencyRepo = {
  async findByKey(key, userId = null, client = null) {
    if (!key) return null;
    const db = client || pool;
    try {
      let query = 'SELECT * FROM idempotency_keys WHERE key = $1';
      const params = [key.trim()];

      if (userId !== null && userId !== undefined) {
        query += ' AND user_id = $2';
        params.push(Number(userId));
      }

      const res = await db.query(query, params);
      if (res.rows.length === 0) return null;

      const row = res.rows[0];
      return {
        key: row.key,
        userId: row.user_id,
        requestHash: row.request_hash,
        responseStatus: row.response_status,
        statusCode: row.response_status,
        responseBody: row.response_body,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(data, client = null) {
    const db = client || pool;
    try {
      const {
        key,
        userId = 1,
        requestHash = '',
        responseBody = {},
      } = data;

      const finalUserId = Number(userId || 1);
      const finalStatus = Number(data.statusCode !== undefined ? data.statusCode : (data.responseStatus !== undefined ? data.responseStatus : 200));

      const res = await db.query(
        `INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body, created_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id, key) DO UPDATE SET
           request_hash = EXCLUDED.request_hash,
           response_status = EXCLUDED.response_status,
           response_body = EXCLUDED.response_body
         RETURNING *`,
        [
          finalUserId,
          key.trim(),
          requestHash,
          finalStatus,
          JSON.stringify(responseBody),
        ],
      );

      const row = res.rows[0];
      return {
        key: row.key,
        userId: row.user_id,
        requestHash: row.request_hash,
        responseStatus: row.response_status,
        statusCode: row.response_status,
        responseBody: row.response_body,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async delete(key, userId = null, client = null) {
    const db = client || pool;
    try {
      let query = 'DELETE FROM idempotency_keys WHERE key = $1';
      const params = [key.trim()];
      if (userId !== null && userId !== undefined) {
        query += ' AND user_id = $2';
        params.push(Number(userId));
      }
      const res = await db.query(query, params);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async cleanOldKeys(hours = 24, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        "DELETE FROM idempotency_keys WHERE created_at < now() - (interval '1 hour' * $1)",
        [hours],
      );
      return res.rowCount;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = idempotencyRepo;
