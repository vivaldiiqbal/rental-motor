const { pool } = require('../../../db/pool');
const { mapDocument } = require('./mappers');
const { handlePgError } = require('./errors');

const documentRepo = {
  async findByUserId(userId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT * FROM user_documents WHERE user_id = $1 ORDER BY type ASC',
        [Number(userId)],
      );
      const foundMap = new Map(res.rows.map((r) => [r.type, mapDocument(r)]));

      // Kembalikan entri ktp dan sim (jika tidak ada di tabel, status = 'not_uploaded')
      return ['ktp', 'sim'].map((t) => {
        if (foundMap.has(t)) return foundMap.get(t);
        return {
          id: null,
          userId: Number(userId),
          type: t,
          storedName: null,
          filePath: null,
          status: 'not_uploaded',
          uploadedAt: null,
          verifiedAt: null,
        };
      });
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByUserIdAndType(userId, type, client = null) {
    return this.findByUserAndType(userId, type, client);
  },

  async findByUserAndType(userId, type, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT * FROM user_documents WHERE user_id = $1 AND type = $2',
        [Number(userId), type],
      );
      if (res.rows.length > 0) return mapDocument(res.rows[0]);
      return {
        id: null,
        userId: Number(userId),
        type,
        storedName: null,
        filePath: null,
        status: 'not_uploaded',
        uploadedAt: null,
        verifiedAt: null,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async upsert(docData, client = null) {
    const db = client || pool;
    try {
      const {
        userId,
        type,
        filePath = null,
        storedName = null,
        fileName = null,
        fileSize = 0,
        sizeBytes = 0,
        mimeType = 'image/jpeg',
        status = 'pending',
        verifiedAt = null,
      } = docData;

      const finalName = storedName || fileName || (filePath ? filePath.split('/').pop() : `${type}_user_${userId}.jpg`);
      const finalSize = Number(sizeBytes || fileSize || 245600);

      if (status === 'not_uploaded') {
        await db.query('DELETE FROM user_documents WHERE user_id = $1 AND type = $2', [Number(userId), type]);
        return {
          id: null,
          userId: Number(userId),
          type,
          storedName: null,
          filePath: null,
          status: 'not_uploaded',
        };
      }

      const res = await db.query(
        `INSERT INTO user_documents (
           user_id, type, stored_name, mime_type, size_bytes, status, uploaded_at, verified_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
         ON CONFLICT (user_id, type) DO UPDATE SET
           stored_name = EXCLUDED.stored_name,
           mime_type = EXCLUDED.mime_type,
           size_bytes = EXCLUDED.size_bytes,
           status = EXCLUDED.status,
           uploaded_at = now(),
           verified_at = EXCLUDED.verified_at,
           reviewer_note = NULL
         RETURNING *`,
        [Number(userId), type, finalName, mimeType, finalSize, status, verifiedAt],
      );

      return mapDocument(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.status && filter.status !== 'all') {
        params.push(filter.status);
        conditions.push(`ud.status = $${params.length}`);
      }
      if (filter.type && filter.type !== 'all') {
        params.push(filter.type);
        conditions.push(`ud.type = $${params.length}`);
      }
      if (filter.userId) {
        params.push(Number(filter.userId));
        conditions.push(`ud.user_id = $${params.length}`);
      }
      if (filter.search) {
        const escaped = `%${String(filter.search).replace(/([%_\\])/g, '\\$1').toLowerCase()}%`;
        params.push(escaped);
        const pNum = `$${params.length}`;
        conditions.push(`(lower(u.name) LIKE ${pNum} OR lower(u.email) LIKE ${pNum} OR u.phone LIKE ${pNum})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM user_documents ud
         JOIN users u ON u.id = ud.user_id
         ${whereClause}`,
        params,
      );
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page ?? filter.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit ?? filter.limit, 10) || 10);
      const offset = (page - 1) * limit;

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `SELECT ud.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, rp.nik_last4
         FROM user_documents ud
         JOIN users u ON u.id = ud.user_id
         LEFT JOIN renter_profiles rp ON rp.user_id = ud.user_id
         ${whereClause}
         ORDER BY ud.uploaded_at DESC, ud.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      const items = res.rows.map((r) => {
        const uploadedIso = r.uploaded_at ? new Date(r.uploaded_at).toISOString() : null;
        const reviewedIso = r.verified_at ? new Date(r.verified_at).toISOString() : null;
        const relFilePath = r.stored_name ? `uploads/documents/${r.stored_name}` : null;
        return {
          id: `doc-${r.user_id}-${r.type}`,
          userId: r.user_id,
          userName: r.user_name,
          userEmail: r.user_email,
          userPhone: r.user_phone,
          type: r.type,
          status: r.status,
          storedName: r.stored_name || null,
          stored_name: r.stored_name || null,
          filePath: relFilePath,
          file_path: relFilePath,
          fileUrl: `/api/admin/documents/${r.user_id}/${r.type}/file`,
          idNumber: r.type === 'ktp'
            ? (r.nik_last4 ? `••••••••••••${r.nik_last4}` : '3201************')
            : 'SIM-C-********',
          rejectionReason: r.reviewer_note || null,
          reviewerNote: r.reviewer_note || null,
          uploadedAt: uploadedIso,
          updatedAt: uploadedIso,
          uploaded_at: uploadedIso,
          updated_at: uploadedIso,
          reviewedAt: reviewedIso,
          verifiedAt: reviewedIso,
          reviewerId: r.reviewed_by || null,
        };
      });

      return { items, total, page, limit };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateStatus(userId, type, status, metaPayload = null, client = null) {
    const db = client || pool;
    try {
      if (status === 'not_uploaded') {
        await db.query('DELETE FROM user_documents WHERE user_id = $1 AND type = $2', [Number(userId), type]);
        return null;
      }

      const reviewerNote = typeof metaPayload === 'string'
        ? metaPayload
        : (metaPayload?.rejectionReason || metaPayload?.reviewerNote || null);
      const reviewerId = typeof metaPayload === 'object' && metaPayload?.reviewerId
        ? Number(metaPayload.reviewerId)
        : null;

      const verifiedAt = status === 'verified' ? new Date().toISOString() : null;
      const res = await db.query(
        `UPDATE user_documents
         SET status = $1, reviewer_note = $2, reviewed_by = $3, verified_at = $4
         WHERE user_id = $5 AND type = $6
         RETURNING *`,
        [status, reviewerNote, reviewerId, verifiedAt, Number(userId), type],
      );
      return res.rows.length > 0 ? mapDocument(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = documentRepo;
