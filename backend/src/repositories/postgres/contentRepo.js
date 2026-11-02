const { pool } = require('../../../db/pool');
const { handlePgError } = require('./errors');

const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

const mapPage = (r) =>
  r && {
    id: r.id,
    slug: r.slug,
    title: r.title,
    body: r.body,
    version: r.version,
    isPublished: r.is_published,
    updatedBy: r.updated_by,
    updatedAt: iso(r.updated_at),
  };

const mapVersion = (r) =>
  r && {
    id: r.id,
    pageId: r.page_id,
    version: r.version,
    title: r.title,
    body: r.body,
    changeNote: r.change_note,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };

const mapFaq = (r) =>
  r && {
    id: r.id,
    question: r.question,
    answer: r.answer,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    updatedBy: r.updated_by,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };

const mapBlock = (r) =>
  r && { key: r.key, value: r.value, updatedBy: r.updated_by, updatedAt: iso(r.updated_at) };

/**
 * Content Repository (PostgreSQL).
 * Argumen posisional tetap, lalu `client = null` di akhir (konvensi bindPostgresRepo).
 * Pemanggil WAJIB mengirim semua argumen posisional.
 */
const contentRepo = {
  // ---------- Halaman ----------
  async listPages(client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM pages ORDER BY slug ASC');
      return res.rows.map(mapPage);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getPageBySlug(slug, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM pages WHERE slug = $1', [slug]);
      return mapPage(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getPageBySlugForUpdate(slug, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM pages WHERE slug = $1 FOR UPDATE', [slug]);
      return mapPage(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async createPageIfAbsent(data, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `INSERT INTO pages (slug, title, body, version, is_published, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING
         RETURNING *`,
        [data.slug, data.title, data.body, data.version || 1, data.isPublished !== false, data.updatedBy ?? null],
      );
      return mapPage(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async savePageContent(slug, data, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `UPDATE pages SET title = $2, body = $3, version = $4, updated_by = $5, updated_at = now()
         WHERE slug = $1 RETURNING *`,
        [slug, data.title, data.body, data.version, data.updatedBy ?? null],
      );
      return mapPage(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async setPagePublished(slug, isPublished, updatedBy, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `UPDATE pages SET is_published = $2, updated_by = $3, updated_at = now()
         WHERE slug = $1 RETURNING *`,
        [slug, Boolean(isPublished), updatedBy ?? null],
      );
      return mapPage(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async insertPageVersion(pageId, data, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `INSERT INTO page_versions (page_id, version, title, body, change_note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (page_id, version) DO NOTHING
         RETURNING *`,
        [pageId, data.version, data.title, data.body, data.changeNote ?? null, data.createdBy ?? null],
      );
      return mapVersion(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async listPageVersions(pageId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM page_versions WHERE page_id = $1 ORDER BY version DESC', [pageId]);
      return res.rows.map(mapVersion);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getPageVersion(pageId, version, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM page_versions WHERE page_id = $1 AND version = $2', [pageId, version]);
      return mapVersion(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  // ---------- FAQ ----------
  async listFaqEntries(activeOnly, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT * FROM faqs ${activeOnly ? 'WHERE is_active = true' : ''} ORDER BY sort_order ASC, id ASC`,
      );
      return res.rows.map(mapFaq);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getFaqEntry(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM faqs WHERE id = $1', [Number(id)]);
      return mapFaq(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async createFaqEntry(data, client = null) {
    const db = client || pool;
    try {
      let order = data.sortOrder;
      if (order === undefined || order === null) {
        const m = await db.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM faqs');
        order = m.rows[0].next;
      }
      const res = await db.query(
        `INSERT INTO faqs (question, answer, sort_order, is_active, updated_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [data.question, data.answer, order, data.isActive !== false, data.updatedBy ?? null],
      );
      return mapFaq(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateFaqEntry(id, patch, updatedBy, client = null) {
    const db = client || pool;
    try {
      const sets = [];
      const params = [Number(id)];
      if (patch.question !== undefined) {
        params.push(patch.question);
        sets.push(`question = $${params.length}`);
      }
      if (patch.answer !== undefined) {
        params.push(patch.answer);
        sets.push(`answer = $${params.length}`);
      }
      if (patch.isActive !== undefined) {
        params.push(Boolean(patch.isActive));
        sets.push(`is_active = $${params.length}`);
      }
      params.push(updatedBy ?? null);
      sets.push(`updated_by = $${params.length}`);
      const res = await db.query(
        `UPDATE faqs SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
        params,
      );
      return mapFaq(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async deleteFaqEntry(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM faqs WHERE id = $1', [Number(id)]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async reorderFaqEntries(ids, updatedBy, client = null) {
    const db = client || pool;
    try {
      for (let i = 0; i < ids.length; i++) {
        await db.query('UPDATE faqs SET sort_order = $2, updated_by = $3, updated_at = now() WHERE id = $1', [
          Number(ids[i]),
          i + 1,
          updatedBy ?? null,
        ]);
      }
      const res = await db.query('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC');
      return res.rows.map(mapFaq);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  // ---------- Content block ----------
  async listBlockRows(client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM content_blocks ORDER BY key ASC');
      return res.rows.map(mapBlock);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getBlockRow(key, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM content_blocks WHERE key = $1', [key]);
      return mapBlock(res.rows[0]) || null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async upsertBlockRow(key, value, updatedBy, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `INSERT INTO content_blocks (key, value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING *`,
        [key, JSON.stringify(value), updatedBy ?? null],
      );
      return mapBlock(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = contentRepo;
