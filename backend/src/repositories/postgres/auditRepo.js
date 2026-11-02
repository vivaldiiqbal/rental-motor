const { pool } = require('../../../db/pool');
const { mapAuditLog } = require('./mappers');
const { handlePgError } = require('./errors');

function escapeLike(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

const auditRepo = {
  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.action && filter.action !== 'all') {
        params.push(filter.action);
        conditions.push(`a.action = $${params.length}`);
      }

      if (filter.actorId) {
        params.push(Number(filter.actorId));
        conditions.push(`a.actor_id = $${params.length}`);
      }

      if (filter.actorRole && filter.actorRole !== 'all') {
        params.push(filter.actorRole);
        conditions.push(`a.actor_role = $${params.length}`);
      }

      if (filter.entityType && filter.entityType !== 'all') {
        params.push(filter.entityType);
        conditions.push(`a.entity_type = $${params.length}`);
      }

      if (filter.entityId) {
        params.push(String(filter.entityId));
        conditions.push(`a.entity_id = $${params.length}`);
      }

      if (filter.search) {
        const escaped = `%${escapeLike(filter.search.toLowerCase())}%`;
        params.push(escaped);
        const pNum = `$${params.length}`;
        conditions.push(
          `(lower(a.action) LIKE ${pNum} OR lower(a.entity_type) LIKE ${pNum} OR lower(u.name) LIKE ${pNum})`,
        );
      }

      if (filter.date) {
        params.push(filter.date);
        conditions.push(`(a.at AT TIME ZONE 'Asia/Jakarta')::date = $${params.length}::date`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         ${whereClause}`,
        params,
      );
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 15);
      const offset = (page - 1) * limit;

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `SELECT a.*, u.name AS actor_name
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         ${whereClause}
         ORDER BY a.at DESC, a.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      return {
        items: res.rows.map(mapAuditLog),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(payload, client = null) {
    const db = client || pool;
    try {
      const actorId = payload.actorId !== undefined
        ? (payload.actorId ? Number(payload.actorId) : null)
        : (payload.userId ? Number(payload.userId) : null);
      const actorRole = payload.actorRole || 'system';
      const action = payload.action;
      const entityType = payload.entityType || payload.entity || 'general';
      const entityId = payload.entityId ? String(payload.entityId) : null;
      const before = payload.before
        ? (typeof payload.before === 'string' ? payload.before : JSON.stringify(payload.before))
        : null;
      const afterPayload = payload.after !== undefined ? payload.after : payload.details;
      const after = afterPayload
        ? (typeof afterPayload === 'string' ? afterPayload : JSON.stringify(afterPayload))
        : null;
      const ip = payload.ip || null;
      const userAgent = payload.userAgent || null;

      const res = await db.query(
        `INSERT INTO audit_logs (
           actor_id, actor_role, action, entity_type, entity_id,
           before, after, ip, user_agent, at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         RETURNING *`,
        [actorId, actorRole, action, entityType, entityId, before, after, ip, userAgent],
      );

      const row = res.rows[0];
      if (payload.actorName) row.actor_name = payload.actorName;
      return mapAuditLog(row);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async record(payload, client = null) {
    return this.create(payload, client);
  },
};

module.exports = auditRepo;
