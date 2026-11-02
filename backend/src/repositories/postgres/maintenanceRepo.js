const { pool } = require('../../../db/pool');
const { mapMaintenanceBlock } = require('./mappers');
const { handlePgError } = require('./errors');

function escapeLike(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

const BASE_SELECT = `
  SELECT mb.*, m.name AS motor_name, m.plate_number AS motor_plate
  FROM maintenance_blocks mb
  JOIN motorcycles m ON m.id = mb.motorcycle_id
`;

const maintenanceRepo = {
  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.motorId) {
        params.push(Number(filter.motorId));
        conditions.push(`mb.motorcycle_id = $${params.length}`);
      }

      if (filter.dateRange && filter.dateRange.start && filter.dateRange.end) {
        params.push(filter.dateRange.start);
        const pStart = `$${params.length}`;
        params.push(filter.dateRange.end);
        const pEnd = `$${params.length}`;
        conditions.push(`(mb.start_date <= ${pEnd}::date AND mb.end_date >= ${pStart}::date)`);
      }

      if (filter.status && filter.status !== 'all') {
        const clock = require('../../utils/clock');
        const { toISODate } = require('../../utils/dates');
        const todayWIB = toISODate(clock.now());

        if (filter.status === 'completed') {
          params.push(todayWIB);
          conditions.push(`(mb.status = 'completed' OR mb.completed_at IS NOT NULL OR mb.end_date < $${params.length}::date)`);
        } else if (filter.status === 'in_progress') {
          params.push(todayWIB);
          const pToday = `$${params.length}`;
          conditions.push(`(mb.status <> 'completed' AND mb.completed_at IS NULL AND mb.start_date <= ${pToday}::date AND mb.end_date >= ${pToday}::date)`);
        } else if (filter.status === 'scheduled') {
          params.push(todayWIB);
          const pToday = `$${params.length}`;
          conditions.push(`(mb.status <> 'completed' AND mb.completed_at IS NULL AND mb.start_date > ${pToday}::date)`);
        }
      }

      if (filter.search) {
        const escaped = `%${escapeLike(filter.search.toLowerCase())}%`;
        params.push(escaped);
        const pNum = `$${params.length}`;
        conditions.push(`(lower(m.name) LIKE ${pNum} OR lower(mb.reason) LIKE ${pNum} OR lower(m.plate_number) LIKE ${pNum})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM maintenance_blocks mb
         JOIN motorcycles m ON m.id = mb.motorcycle_id
         ${whereClause}`,
        params,
      );
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 10);
      const offset = (page - 1) * limit;

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `${BASE_SELECT}
         ${whereClause}
         ORDER BY mb.start_date DESC, mb.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      return {
        items: res.rows.map(mapMaintenanceBlock),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findById(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return null;
    const db = client || pool;
    try {
      const res = await db.query(`${BASE_SELECT} WHERE mb.id = $1`, [Number(id)]);
      return res.rows.length > 0 ? mapMaintenanceBlock(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findOverlapping(motorId, start, end, excludeId = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `${BASE_SELECT}
         WHERE mb.motorcycle_id = $1
           AND (mb.status IS NULL OR mb.status <> 'completed')
           AND mb.completed_at IS NULL
           AND daterange(mb.start_date, mb.end_date, '[)') && daterange($2::date, $3::date, '[)')
           AND ($4::int IS NULL OR mb.id <> $4::int)
         ORDER BY mb.start_date ASC`,
        [Number(motorId), start, end, excludeId ? Number(excludeId) : null],
      );
      return res.rows.map(mapMaintenanceBlock);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(payload, client = null) {
    const db = client || pool;
    try {
      const motorId = Number(payload.motorId || payload.motorcycleId);
      const startDate = payload.startDate;
      const endDate = payload.endDate;
      const reason = payload.reason || 'Perawatan berkala';
      const cost = Number(payload.cost || 0);
      const status = payload.status || 'scheduled';
      const createdBy = payload.createdBy ? Number(payload.createdBy) : null;

      const res = await db.query(
        `INSERT INTO maintenance_blocks (
           motorcycle_id, start_date, end_date, reason, cost, status, created_by, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
         RETURNING *`,
        [motorId, startDate, endDate, reason, cost, status, createdBy],
      );

      return this.findById(res.rows[0].id, db);
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

      if (patch.startDate) {
        params.push(patch.startDate);
        setClauses.push(`start_date = $${params.length}`);
      }
      if (patch.endDate) {
        params.push(patch.endDate);
        setClauses.push(`end_date = $${params.length}`);
      }
      if (patch.reason !== undefined) {
        params.push(patch.reason);
        setClauses.push(`reason = $${params.length}`);
      }
      if (patch.cost !== undefined) {
        params.push(Number(patch.cost));
        setClauses.push(`cost = $${params.length}`);
      }
      if (patch.status !== undefined) {
        params.push(patch.status);
        setClauses.push(`status = $${params.length}`);
      }
      if (patch.completedAt !== undefined) {
        params.push(patch.completedAt);
        setClauses.push(`completed_at = $${params.length}`);
      }
      if (patch.completedBy !== undefined) {
        params.push(patch.completedBy ? Number(patch.completedBy) : null);
        setClauses.push(`completed_by = $${params.length}`);
      }
      if (patch.completionNotes !== undefined) {
        params.push(patch.completionNotes);
        setClauses.push(`completion_notes = $${params.length}`);
      }

      if (setClauses.length > 0) {
        await db.query(
          `UPDATE maintenance_blocks SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $1`,
          params,
        );
      }

      return this.findById(id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async delete(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return false;
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM maintenance_blocks WHERE id = $1', [Number(id)]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = maintenanceRepo;
