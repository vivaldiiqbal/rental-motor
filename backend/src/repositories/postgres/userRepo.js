const path = require('path');
const { pool } = require('../../../db/pool');
const { mapUser } = require('./mappers');
const { handlePgError } = require('./errors');

async function getDocumentsForUsers(userIds, client = null) {
  if (!userIds || userIds.length === 0) {
    return { docsMap: new Map(), pathsMap: new Map() };
  }
  const db = client || pool;
  const res = await db.query(
    'SELECT user_id, type, status, stored_name FROM user_documents WHERE user_id = ANY($1::int[])',
    [userIds],
  );
  const docsMap = new Map();
  const pathsMap = new Map();

  userIds.forEach((uid) => {
    docsMap.set(uid, { ktp: 'not_uploaded', sim: 'not_uploaded' });
    pathsMap.set(uid, {});
  });

  res.rows.forEach((r) => {
    if (!docsMap.has(r.user_id)) {
      docsMap.set(r.user_id, { ktp: 'not_uploaded', sim: 'not_uploaded' });
      pathsMap.set(r.user_id, {});
    }
    docsMap.get(r.user_id)[r.type] = r.status;
    if (r.stored_name) {
      pathsMap.get(r.user_id)[r.type] = `uploads/${r.stored_name}`;
    }
  });

  return { docsMap, pathsMap };
}

function escapeLike(str) {
  return String(str || '').replace(/([%_\\])/g, '\\$1');
}

const userRepo = {
  async countActiveAdmins(excludeId = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM users
         WHERE role = 'admin'
           AND is_active = true
           AND ($1::int IS NULL OR id <> $1::int)`,
        [excludeId ? Number(excludeId) : null],
      );
      return res.rows[0].count;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM users WHERE id = $1', [Number(id)]);
      if (res.rows.length === 0) return null;

      const { docsMap, pathsMap } = await getDocumentsForUsers([res.rows[0].id], db);
      return mapUser(res.rows[0], docsMap.get(res.rows[0].id), pathsMap.get(res.rows[0].id));
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByEmail(email, client = null) {
    if (!email) return null;
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);
      if (res.rows.length === 0) return null;

      const { docsMap, pathsMap } = await getDocumentsForUsers([res.rows[0].id], db);
      return mapUser(res.rows[0], docsMap.get(res.rows[0].id), pathsMap.get(res.rows[0].id));
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.role && filter.role !== 'all') {
        params.push(filter.role);
        conditions.push(`role = $${params.length}`);
      }

      if (filter.isActive !== undefined) {
        params.push(Boolean(filter.isActive));
        conditions.push(`is_active = $${params.length}`);
      }

      if (filter.search) {
        const escaped = `%${escapeLike(filter.search.toLowerCase())}%`;
        params.push(escaped);
        const pNum = `$${params.length}`;
        conditions.push(`(lower(name) LIKE ${pNum} OR lower(email) LIKE ${pNum} OR phone LIKE ${pNum})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM users ${whereClause}`, params);
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 10);
      const offset = (page - 1) * limit;

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `SELECT * FROM users ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      const userIds = res.rows.map((r) => r.id);
      const { docsMap, pathsMap } = await getDocumentsForUsers(userIds, db);

      const items = res.rows.map((r) => mapUser(r, docsMap.get(r.id), pathsMap.get(r.id)));
      return { items, total };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(userData, client = null) {
    const db = client || pool;
    try {
      const {
        name,
        email,
        phone,
        role = 'customer',
        passwordHash,
        emergencyContact = null,
      } = userData;

      const emName = emergencyContact?.name || null;
      const emPhone = emergencyContact?.phone || null;

      const res = await db.query(
        `INSERT INTO users (
           name, email, phone, role, password_hash,
           emergency_contact_name, emergency_contact_phone, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING *`,
        [
          name,
          email.trim().toLowerCase(),
          phone,
          role,
          passwordHash,
          emName,
          emPhone,
        ],
      );

      const user = res.rows[0];
      // Catatan: Dokumen berstatus 'not_uploaded' tidak disimpan di user_documents
      return mapUser(user, { ktp: 'not_uploaded', sim: 'not_uploaded' }, {});
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async update(id, patch, client = null) {
    const db = client || pool;
    try {
      const setClauses = [];
      const params = [Number(id)];

      if (patch.name !== undefined) {
        params.push(patch.name);
        setClauses.push(`name = $${params.length}`);
      }
      if (patch.phone !== undefined) {
        params.push(patch.phone);
        setClauses.push(`phone = $${params.length}`);
      }
      if (patch.role !== undefined) {
        params.push(patch.role);
        setClauses.push(`role = $${params.length}`);
      }
      if (patch.passwordHash !== undefined) {
        params.push(patch.passwordHash);
        setClauses.push(`password_hash = $${params.length}`);
      }
      if (patch.emergencyContact !== undefined) {
        params.push(patch.emergencyContact?.name || null);
        setClauses.push(`emergency_contact_name = $${params.length}`);
        params.push(patch.emergencyContact?.phone || null);
        setClauses.push(`emergency_contact_phone = $${params.length}`);
      }
      if (patch.isActive !== undefined) {
        params.push(Boolean(patch.isActive));
        setClauses.push(`is_active = $${params.length}`);
      }

      // Handle dokumen jika di-update lewat patch user
      if (patch.documents || patch.documentPaths) {
        const types = new Set([
          ...Object.keys(patch.documents || {}),
          ...Object.keys(patch.documentPaths || {}),
        ]);
        for (const type of types) {
          if (['ktp', 'sim'].includes(type)) {
            const rawStatus = patch.documents
              ? (typeof patch.documents[type] === 'object' && patch.documents[type]
                  ? patch.documents[type].status
                  : patch.documents[type])
              : null;
            const filePath = patch.documentPaths ? patch.documentPaths[type] : null;
            const storedName = filePath ? path.basename(filePath) : `${type}_user_${id}.jpg`;

            if (rawStatus && rawStatus !== 'not_uploaded') {
              await db.query(
                `INSERT INTO user_documents (user_id, type, stored_name, mime_type, size_bytes, status, uploaded_at, verified_at)
                 VALUES ($1, $2, $3, 'image/jpeg', 245600, $4::varchar, now(), CASE WHEN $4::varchar = 'verified' THEN now() ELSE NULL END)
                 ON CONFLICT (user_id, type) DO UPDATE SET
                   status = EXCLUDED.status,
                   stored_name = EXCLUDED.stored_name,
                   verified_at = CASE WHEN EXCLUDED.status = 'verified' THEN now() ELSE user_documents.verified_at END`,
                [Number(id), type, storedName, rawStatus],
              );
            } else if (rawStatus === 'not_uploaded') {
              // Jika status di-reset ke not_uploaded, hapus dari user_documents
              await db.query('DELETE FROM user_documents WHERE user_id = $1 AND type = $2', [Number(id), type]);
            }
          }
        }
      }

      if (setClauses.length > 0) {
        await db.query(
          `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1`,
          params,
        );
      }

      return this.findById(id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async delete(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM users WHERE id = $1', [Number(id)]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = userRepo;
