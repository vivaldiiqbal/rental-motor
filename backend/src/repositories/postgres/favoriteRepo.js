const { pool } = require('../../../db/pool');
const { mapFavorite } = require('./mappers');
const { handlePgError } = require('./errors');

const favoriteRepo = {
  async findByUserId(userId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT * FROM favorites WHERE user_id = $1 ORDER BY created_at DESC',
        [Number(userId)],
      );
      return res.rows.map(mapFavorite);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async isFavorite(userId, motorId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT 1 FROM favorites WHERE user_id = $1 AND motorcycle_id = $2',
        [Number(userId), Number(motorId)],
      );
      return res.rows.length > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async add(userId, motorId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `INSERT INTO favorites (user_id, motorcycle_id, created_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id, motorcycle_id) DO NOTHING
         RETURNING *`,
        [Number(userId), Number(motorId)],
      );
      if (res.rows.length > 0) return mapFavorite(res.rows[0]);
      return { userId: Number(userId), motorId: Number(motorId), motorcycleId: Number(motorId) };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async remove(userId, motorId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'DELETE FROM favorites WHERE user_id = $1 AND motorcycle_id = $2',
        [Number(userId), Number(motorId)],
      );
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async sync(userId, motorIds = [], client = null) {
    const db = client || pool;
    try {
      const numUserId = Number(userId);
      const validMotorIds = motorIds.map(Number).filter((n) => !isNaN(n));

      if (validMotorIds.length > 0) {
        await db.query(
          `INSERT INTO favorites (user_id, motorcycle_id, created_at)
           SELECT $1, m.id, now()
           FROM unnest($2::int[]) AS fid
           JOIN motorcycles m ON m.id = fid AND m.status = 'active'
           ON CONFLICT (user_id, motorcycle_id) DO NOTHING`,
          [numUserId, validMotorIds],
        );
      }

      const res = await db.query(
        'SELECT motorcycle_id FROM favorites WHERE user_id = $1 ORDER BY created_at ASC',
        [numUserId],
      );
      return res.rows.map((r) => Number(r.motorcycle_id));
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = favoriteRepo;
