const { pool } = require('../../../db/pool');
const { mapPromo } = require('./mappers');
const { handlePgError } = require('./errors');

const promoRepo = {
  async findByCode(code, client = null) {
    if (!code) return null;
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT * FROM promo_codes WHERE upper(code) = upper($1)',
        [code.trim()],
      );
      return res.rows.length > 0 ? mapPromo(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(onlyActive = true, client = null) {
    const db = client || pool;
    try {
      let query = 'SELECT * FROM promo_codes';
      const params = [];
      if (onlyActive) {
        query += ' WHERE is_active = true AND valid_until >= CURRENT_DATE AND (usage_limit IS NULL OR used_count < usage_limit)';
      }
      query += ' ORDER BY id ASC';

      const res = await db.query(query, params);
      return res.rows.map(mapPromo);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async decrementQuota(code, client = null) {
    if (!code) return false;
    const db = client || pool;
    try {
      // Mengurangi kuota dengan menambah used_count
      const res = await db.query(
        `UPDATE promo_codes
         SET used_count = used_count + 1, updated_at = now()
         WHERE upper(code) = upper($1)
           AND (usage_limit IS NULL OR used_count < usage_limit)
         RETURNING id`,
        [code.trim()],
      );
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async incrementQuota(code, client = null) {
    if (!code) return false;
    const db = client || pool;
    try {
      // Mengembalikan kuota dengan mengurangi used_count
      const res = await db.query(
        `UPDATE promo_codes
         SET used_count = GREATEST(0, used_count - 1), updated_at = now()
         WHERE upper(code) = upper($1)
         RETURNING id`,
        [code.trim()],
      );
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(promoData, client = null) {
    const db = client || pool;
    try {
      const {
        id,
        code,
        type,
        value,
        maxDiscount = null,
        minDays = 1,
        weekendOnly = false,
        requiresWeekend = false,
        validFrom = new Date().toISOString().slice(0, 10),
        validUntil,
        quota = null,
        usageLimit = null,
        isActive = true,
      } = promoData;

      const finalLimit = usageLimit !== null ? usageLimit : (quota !== null && quota !== undefined ? quota : null);
      const isWeekendOnly = Boolean(weekendOnly || requiresWeekend);

      let query;
      let params;

      if (id !== undefined && id !== null) {
        query = `
          INSERT INTO promo_codes (
            id, code, type, value, max_discount, min_days, weekend_only,
            valid_from, valid_until, usage_limit, used_count, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11)
          RETURNING *`;
        params = [
          Number(id), code.toUpperCase(), type, Number(value),
          maxDiscount ? Number(maxDiscount) : null,
          Number(minDays), isWeekendOnly,
          validFrom, validUntil, finalLimit ? Number(finalLimit) : null,
          Boolean(isActive),
        ];
      } else {
        query = `
          INSERT INTO promo_codes (
            code, type, value, max_discount, min_days, weekend_only,
            valid_from, valid_until, usage_limit, used_count, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)
          RETURNING *`;
        params = [
          code.toUpperCase(), type, Number(value),
          maxDiscount ? Number(maxDiscount) : null,
          Number(minDays), isWeekendOnly,
          validFrom, validUntil, finalLimit ? Number(finalLimit) : null,
          Boolean(isActive),
        ];
      }

      const res = await db.query(query, params);
      return mapPromo(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findById(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return null;
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM promo_codes WHERE id = $1', [Number(id)]);
      return res.rows.length > 0 ? mapPromo(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async hasUsage(codeOrId, client = null) {
    const db = client || pool;
    try {
      const item = (await this.findByCode(String(codeOrId), db)) || (await this.findById(codeOrId, db));
      if (!item) return false;

      const res = await db.query(
        'SELECT 1 FROM bookings WHERE promo_code_id = $1 LIMIT 1',
        [item.id],
      );
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async update(id, patch, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return null;
    const db = client || pool;
    try {
      const setClauses = [];
      const params = [Number(id)];

      const fieldMap = {
        code: 'code',
        type: 'type',
        value: 'value',
        maxDiscount: 'max_discount',
        minDays: 'min_days',
        weekendOnly: 'weekend_only',
        validFrom: 'valid_from',
        validUntil: 'valid_until',
        usageLimit: 'usage_limit',
        quota: 'usage_limit',
        isActive: 'is_active',
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (patch[key] !== undefined) {
          let val = patch[key];
          if (key === 'code') val = String(val).trim().toUpperCase();
          params.push(val);
          setClauses.push(`${col} = $${params.length}`);
        }
      }

      if (setClauses.length > 0) {
        await db.query(
          `UPDATE promo_codes SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $1`,
          params,
        );
      }

      return this.findById(id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async toggleActive(id, client = null) {
    const db = client || pool;
    const item = await this.findById(id, db);
    if (!item) return null;
    return this.update(id, { isActive: !item.isActive }, db);
  },

  async delete(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return false;
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM promo_codes WHERE id = $1', [Number(id)]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = promoRepo;
