const { pool } = require('../../../db/pool');
const { handlePgError } = require('./errors');

const eventRepo = {
  /**
   * Menulis event ke tabel outbox events di dalam transaksi yang sama.
   */
  async recordEvent(eventData, client = null) {
    const db = client || pool;
    try {
      const {
        type,
        entityId = null,
        userId = null,
        version = 1,
        payload = {},
      } = eventData;

      const res = await db.query(
        `INSERT INTO events (type, entity_id, user_id, version, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, now())
         RETURNING id, type, entity_id AS "entityId", user_id AS "userId", version, payload, created_at AS "createdAt"`,
        [
          type,
          entityId ? String(entityId) : null,
          userId ? Number(userId) : null,
          Number(version || 1),
          JSON.stringify(payload || {}),
        ],
      );

      return res.rows[0];
    } catch (err) {
      throw handlePgError(err);
    }
  },

  /**
   * Mengambil peristiwa terlewat sejak lastEventId dengan retensi 24 jam dan isolasi pengguna.
   */
  async getMissedEvents(lastEventId, user, hoursLimit = 24) {
    try {
      const numericId = Number(lastEventId || 0);
      const isStaffOrAdmin = user && (user.role === 'admin' || user.role === 'staff');
      const userId = user?.id ? Number(user.id) : null;

      let query = '';
      let params = [];

      if (isStaffOrAdmin) {
        query = `
          SELECT id, type, entity_id AS "entityId", user_id AS "userId", version, payload, created_at AS "createdAt"
          FROM events
          WHERE id > $1 AND created_at >= now() - ($2 || ' hours')::interval
          ORDER BY id ASC
          LIMIT 500
        `;
        params = [numericId, String(hoursLimit)];
      } else {
        query = `
          SELECT id, type, entity_id AS "entityId", user_id AS "userId", version, payload, created_at AS "createdAt"
          FROM events
          WHERE id > $1
            AND created_at >= now() - ($2 || ' hours')::interval
            AND (user_id IS NULL OR user_id = $3)
          ORDER BY id ASC
          LIMIT 500
        `;
        params = [numericId, String(hoursLimit), userId];
      }

      const res = await pool.query(query, params);
      return res.rows.map((row) => ({
        id: Number(row.id),
        type: row.type,
        entityId: row.entityId,
        userId: row.userId ? Number(row.userId) : null,
        version: Number(row.version || 1),
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {}),
        createdAt: new Date(row.createdAt).toISOString(),
      }));
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = eventRepo;
