const { pool } = require('../../../db/pool');
const { mapAddon } = require('./mappers');
const { handlePgError } = require('./errors');

function escapeLike(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

const addonRepo = {
  async findAll(filter = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.isActive !== undefined) {
        params.push(Boolean(filter.isActive));
        conditions.push(`is_active = $${params.length}`);
      }

      if (filter.search) {
        const escaped = `%${escapeLike(filter.search.toLowerCase())}%`;
        params.push(escaped);
        conditions.push(`lower(name) LIKE $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const res = await db.query(`SELECT * FROM addons ${whereClause} ORDER BY id ASC`, params);
      return res.rows.map(mapAddon);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findById(id, client = null) {
    if (id === null || id === undefined) return null;
    const db = client || pool;
    try {
      let query;
      let params;
      if (!isNaN(Number(id))) {
        query = 'SELECT * FROM addons WHERE id = $1 OR upper(code) = upper($2)';
        params = [Number(id), String(id)];
      } else {
        query = 'SELECT * FROM addons WHERE upper(code) = upper($1)';
        params = [String(id)];
      }

      const res = await db.query(query, params);
      return res.rows.length > 0 ? mapAddon(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async hasUsage(id, client = null) {
    const db = client || pool;
    try {
      const item = await this.findById(id, db);
      if (!item) return false;

      // Cek apakah ada booking_items bertipe 'addon' yang labelnya cocok dengan addon ini
      const res = await db.query(
        `SELECT 1 FROM booking_items
         WHERE kind = 'addon' AND lower(label) LIKE $1
         LIMIT 1`,
        [`%${item.name.toLowerCase()}%`],
      );
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(payload, client = null) {
    const db = client || pool;
    try {
      const name = payload.name.trim();
      const code = (payload.code || `addon-${Date.now()}`).toLowerCase().replace(/\s+/g, '-');
      const price = Number(payload.price ?? payload.pricePerDay ?? 10000);
      const isActive = payload.isActive !== false;

      const res = await db.query(
        `INSERT INTO addons (code, name, price_per_day, is_active, updated_at)
         VALUES ($1, $2, $3, $4, now())
         RETURNING *`,
        [code, name, price, isActive],
      );
      return mapAddon(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async update(id, patch, client = null) {
    const db = client || pool;
    try {
      const existing = await this.findById(id, db);
      if (!existing) return null;

      const setClauses = [];
      const params = [existing.id];

      if (patch.name) {
        params.push(patch.name.trim());
        setClauses.push(`name = $${params.length}`);
      }
      if (patch.price !== undefined || patch.pricePerDay !== undefined) {
        params.push(Number(patch.price ?? patch.pricePerDay));
        setClauses.push(`price_per_day = $${params.length}`);
      }
      if (patch.isActive !== undefined) {
        params.push(Boolean(patch.isActive));
        setClauses.push(`is_active = $${params.length}`);
      }

      if (setClauses.length > 0) {
        await db.query(
          `UPDATE addons SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $1`,
          params,
        );
      }

      return this.findById(existing.id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async toggleActive(id, client = null) {
    const db = client || pool;
    const item = await this.findById(id, db);
    if (!item) return null;
    return this.update(item.id, { isActive: !item.isActive }, db);
  },

  async delete(id, client = null) {
    const db = client || pool;
    try {
      const existing = await this.findById(id, db);
      if (!existing) return false;

      const res = await db.query('DELETE FROM addons WHERE id = $1', [existing.id]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = addonRepo;
