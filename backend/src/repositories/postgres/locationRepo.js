const { pool } = require('../../../db/pool');
const { mapPickupLocation } = require('./mappers');
const { handlePgError } = require('./errors');

function escapeLike(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

const locationRepo = {
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
        const pNum = `$${params.length}`;
        conditions.push(`(lower(name) LIKE ${pNum} OR lower(address) LIKE ${pNum})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const res = await db.query(
        `SELECT * FROM pickup_locations ${whereClause} ORDER BY sort_order ASC, id ASC`,
        params,
      );
      return res.rows.map(mapPickupLocation);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findById(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return null;
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM pickup_locations WHERE id = $1', [Number(id)]);
      return res.rows.length > 0 ? mapPickupLocation(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async hasUsage(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return false;
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT 1 FROM bookings WHERE pickup_location_id = $1 LIMIT 1',
        [Number(id)],
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
      const address = (payload.address || '').trim();
      const isActive = payload.isActive !== false;
      const sortOrder = Number(payload.sortOrder || 0);

      const res = await db.query(
        `INSERT INTO pickup_locations (name, address, is_active, sort_order, updated_at)
         VALUES ($1, $2, $3, $4, now())
         RETURNING *`,
        [name, address, isActive, sortOrder],
      );
      return mapPickupLocation(res.rows[0]);
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

      if (patch.name) {
        params.push(patch.name.trim());
        setClauses.push(`name = $${params.length}`);
      }
      if (patch.address !== undefined) {
        params.push(patch.address.trim());
        setClauses.push(`address = $${params.length}`);
      }
      if (patch.isActive !== undefined) {
        params.push(Boolean(patch.isActive));
        setClauses.push(`is_active = $${params.length}`);
      }
      if (patch.sortOrder !== undefined) {
        params.push(Number(patch.sortOrder));
        setClauses.push(`sort_order = $${params.length}`);
      }

      if (setClauses.length > 0) {
        await db.query(
          `UPDATE pickup_locations SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $1`,
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
      const res = await db.query('DELETE FROM pickup_locations WHERE id = $1', [Number(id)]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = locationRepo;
