const { pool } = require('../../../db/pool');
const { mapReview } = require('./mappers');
const { handlePgError } = require('./errors');

function escapeLike(str) {
  return String(str || '').replace(/([%_\\])/g, '\\$1');
}

const BASE_REVIEW_SELECT = `
  SELECT
    r.*,
    u.name AS user_name,
    m.name AS motorcycle_name
  FROM reviews r
  LEFT JOIN users u ON r.user_id = u.id
  LEFT JOIN motorcycles m ON r.motorcycle_id = m.id
`;

const reviewRepo = {
  async findById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(`${BASE_REVIEW_SELECT} WHERE r.id = $1`, [Number(id)]);
      return res.rows.length > 0 ? mapReview(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByMotorId(motorId, paging = {}, client = null) {
    const db = client || pool;
    try {
      const numericMotorId = Number(motorId);
      const countRes = await db.query(
        'SELECT COUNT(*)::int AS total FROM reviews WHERE motorcycle_id = $1 AND is_hidden = false',
        [numericMotorId],
      );
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 20);
      const offset = (page - 1) * limit;

      const res = await db.query(
        `${BASE_REVIEW_SELECT}
         WHERE r.motorcycle_id = $1 AND r.is_hidden = false
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT $2 OFFSET $3`,
        [numericMotorId, limit, offset],
      );

      return {
        items: res.rows.map(mapReview),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.rating) {
        params.push(Number(filter.rating));
        conditions.push(`r.rating = $${params.length}`);
      }

      if (filter.isVisible !== undefined) {
        params.push(!Boolean(filter.isVisible));
        conditions.push(`r.is_hidden = $${params.length}`);
      }

      if (filter.search) {
        const escaped = `%${escapeLike(filter.search.toLowerCase())}%`;
        params.push(escaped);
        const pNum = `$${params.length}`;
        conditions.push(`(lower(u.name) LIKE ${pNum} OR lower(r.comment) LIKE ${pNum})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRes = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM reviews r
         LEFT JOIN users u ON r.user_id = u.id
         ${whereClause}`,
        params,
      );
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 20);
      const offset = (page - 1) * limit;

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `${BASE_REVIEW_SELECT}
         ${whereClause}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      return {
        items: res.rows.map(mapReview),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async setVisibility(id, isVisible, hiddenReason = null, client = null) {
    const db = client || pool;
    try {
      // Kunci baris motor terkait FOR UPDATE dalam transaksi
      await db.query(
        `SELECT id FROM motorcycles
         WHERE id = (SELECT motorcycle_id FROM reviews WHERE id = $1)
         FOR UPDATE`,
        [Number(id)],
      );

      const isHidden = !Boolean(isVisible);
      const res = await db.query(
        `UPDATE reviews
         SET is_hidden = $1,
             hidden_reason = $2,
             hidden_at = CASE WHEN $1 = true THEN now() ELSE NULL END
         WHERE id = $3
         RETURNING *`,
        [isHidden, isHidden ? (hiddenReason || 'Dimoderasi oleh admin') : null, Number(id)],
      );

      if (res.rows.length === 0) return null;
      const reviewRow = res.rows[0];

      if (reviewRow.motorcycle_id) {
        await this.recalcRatings(reviewRow.motorcycle_id, db);
      }

      return this.findById(id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByUserId(userId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `${BASE_REVIEW_SELECT} WHERE r.user_id = $1 ORDER BY r.created_at DESC, r.id DESC`,
        [Number(userId)],
      );
      return res.rows.map(mapReview);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByBookingId(bookingId, client = null) {
    if (!bookingId) return null;
    const db = client || pool;
    try {
      const res = await db.query(
        `${BASE_REVIEW_SELECT} WHERE r.booking_id = $1 LIMIT 1`,
        [Number(bookingId)],
      );
      return res.rows.length > 0 ? mapReview(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async calculateStats(motorId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT
           COUNT(*)::int AS count,
           COALESCE(ROUND(AVG(rating)::numeric, 2), 5.00) AS avg_rating
         FROM reviews
         WHERE motorcycle_id = $1 AND is_hidden = false`,
        [Number(motorId)],
      );
      const count = res.rows[0].count;
      const avg = Number(res.rows[0].avg_rating);
      return {
        rating: count > 0 ? avg : 5.0,
        reviewCount: count,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async recalcRatings(motorId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT
           COALESCE(ROUND(AVG(rating)::numeric, 2), 0.00) AS rating_avg,
           COUNT(*)::int AS rating_count,
           COUNT(*) FILTER (WHERE rating = 1)::int AS rating_1,
           COUNT(*) FILTER (WHERE rating = 2)::int AS rating_2,
           COUNT(*) FILTER (WHERE rating = 3)::int AS rating_3,
           COUNT(*) FILTER (WHERE rating = 4)::int AS rating_4,
           COUNT(*) FILTER (WHERE rating = 5)::int AS rating_5
         FROM reviews
         WHERE motorcycle_id = $1 AND is_hidden = false`,
        [Number(motorId)],
      );
      const row = res.rows[0];
      await db.query(
        `UPDATE motorcycles
         SET rating_avg = $1,
             rating_count = $2,
             rating_1 = $3,
             rating_2 = $4,
             rating_3 = $5,
             rating_4 = $6,
             rating_5 = $7,
             updated_at = now()
         WHERE id = $8`,
        [
          row.rating_avg,
          row.rating_count,
          row.rating_1,
          row.rating_2,
          row.rating_3,
          row.rating_4,
          row.rating_5,
          Number(motorId),
        ],
      );
      return row;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(reviewData, client = null) {
    const db = client || pool;
    try {
      const {
        id,
        bookingId,
        motorId,
        motorcycleId,
        userId,
        rating,
        comment,
      } = reviewData;

      const finalMotorId = Number(motorcycleId || motorId);
      const finalUserId = Number(userId);
      let finalBookingId = bookingId ? Number(bookingId) : null;

      if (!finalBookingId) {
        const bRes = await db.query(
          `SELECT b.id FROM bookings b
           LEFT JOIN reviews r ON b.id = r.booking_id
           WHERE b.user_id = $1 AND b.motorcycle_id = $2 AND r.id IS NULL
           LIMIT 1`,
          [finalUserId, finalMotorId],
        );
        if (bRes.rows.length > 0) {
          finalBookingId = bRes.rows[0].id;
        } else {
          const code = `RK-REV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newB = await db.query(
            `INSERT INTO bookings (
               booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
               renter_name, renter_phone, renter_email, status,
               price_per_day, subtotal, duration_discount, promo_discount, addons_total,
               delivery_total, rental_total, deposit, grand_total, paid_at, created_at
             )
             VALUES (
               $1, $2, $3, CURRENT_DATE - 3, CURRENT_DATE - 1, 2,
               'Pelanggan RodaKita', '081234567890', 'customer@rodakita.id', 'completed',
               75000, 150000, 0, 0, 0,
               0, 150000, 200000, 350000, now(), now()
             )
             RETURNING id`,
            [code, finalUserId, finalMotorId],
          );
          finalBookingId = newB.rows[0].id;
        }
      }

      let query;
      let params;

      if (id !== undefined && id !== null) {
        query = `
          INSERT INTO reviews (id, booking_id, user_id, motorcycle_id, rating, comment, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, now())
          RETURNING id`;
        params = [
          Number(id),
          finalBookingId,
          finalUserId,
          finalMotorId,
          Number(rating),
          comment.slice(0, 500),
        ];
      } else {
        query = `
          INSERT INTO reviews (booking_id, user_id, motorcycle_id, rating, comment, created_at)
          VALUES ($1, $2, $3, $4, $5, now())
          RETURNING id`;
        params = [
          finalBookingId,
          finalUserId,
          finalMotorId,
          Number(rating),
          comment.slice(0, 500),
        ];
      }

      const res = await db.query(query, params);
      await this.recalcRatings(finalMotorId, db);
      return this.findById(res.rows[0].id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async delete(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return false;
    const db = client || pool;
    try {
      const existing = await this.findById(id, db);
      const res = await db.query('DELETE FROM reviews WHERE id = $1', [Number(id)]);
      if (res.rowCount > 0 && existing?.motorId) {
        await this.recalcRatings(existing.motorId, db);
        return true;
      }
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = reviewRepo;
