const store = require('../store');

const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);
const nextId = (list) => list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
const nowIso = () => new Date().toISOString();

/**
 * Kontrak Content Repository (halaman, versi, FAQ, content block).
 * Nama metode sengaja spesifik agar aman dengan bindPostgresRepo.
 * Driver postgres: argumen posisional tetap + client di akhir.
 */
const contentRepo = {
  // ---------- Halaman ----------
  async listPages() {
    return store
      .getCollection('pages')
      .map(clone)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  },

  async getPageBySlug(slug) {
    const p = store.getCollection('pages').find((x) => x.slug === slug);
    return p ? clone(p) : null;
  },

  // Memory: seluruh operasi sudah serial lewat mutex transaksi, jadi sama dengan getPageBySlug.
  async getPageBySlugForUpdate(slug) {
    return this.getPageBySlug(slug);
  },

  async createPageIfAbsent(data) {
    return store.withLock(async () => {
      const pages = store.getCollection('pages');
      if (pages.some((x) => x.slug === data.slug)) return null;
      const rec = {
        id: nextId(pages),
        slug: data.slug,
        title: data.title,
        body: data.body,
        version: data.version || 1,
        isPublished: data.isPublished !== false,
        updatedBy: data.updatedBy ?? null,
        updatedAt: nowIso(),
      };
      pages.push(rec);
      return clone(rec);
    });
  },

  async savePageContent(slug, data) {
    return store.withLock(async () => {
      const p = store.getCollection('pages').find((x) => x.slug === slug);
      if (!p) return null;
      p.title = data.title;
      p.body = data.body;
      p.version = data.version;
      p.updatedBy = data.updatedBy ?? null;
      p.updatedAt = nowIso();
      return clone(p);
    });
  },

  async setPagePublished(slug, isPublished, updatedBy) {
    return store.withLock(async () => {
      const p = store.getCollection('pages').find((x) => x.slug === slug);
      if (!p) return null;
      p.isPublished = Boolean(isPublished);
      p.updatedBy = updatedBy ?? null;
      p.updatedAt = nowIso();
      return clone(p);
    });
  },

  async insertPageVersion(pageId, data) {
    return store.withLock(async () => {
      const list = store.getCollection('pageVersions');
      if (list.some((v) => v.pageId === pageId && v.version === data.version)) return null;
      const rec = {
        id: nextId(list),
        pageId,
        version: data.version,
        title: data.title,
        body: data.body,
        changeNote: data.changeNote ?? null,
        createdBy: data.createdBy ?? null,
        createdAt: nowIso(),
      };
      list.push(rec);
      return clone(rec);
    });
  },

  async listPageVersions(pageId) {
    return store
      .getCollection('pageVersions')
      .filter((v) => v.pageId === pageId)
      .sort((a, b) => b.version - a.version)
      .map(clone);
  },

  async getPageVersion(pageId, version) {
    const v = store.getCollection('pageVersions').find((x) => x.pageId === pageId && x.version === version);
    return v ? clone(v) : null;
  },

  // ---------- FAQ ----------
  async listFaqEntries(activeOnly) {
    let list = store.getCollection('faqs').map(clone);
    if (activeOnly) list = list.filter((f) => f.isActive);
    return list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  },

  async getFaqEntry(id) {
    const f = store.getCollection('faqs').find((x) => x.id === Number(id));
    return f ? clone(f) : null;
  },

  async createFaqEntry(data) {
    return store.withLock(async () => {
      const list = store.getCollection('faqs');
      const maxOrder = list.reduce((m, x) => Math.max(m, x.sortOrder), 0);
      const ts = nowIso();
      const rec = {
        id: nextId(list),
        question: data.question,
        answer: data.answer,
        sortOrder: data.sortOrder ?? maxOrder + 1,
        isActive: data.isActive !== false,
        updatedBy: data.updatedBy ?? null,
        createdAt: ts,
        updatedAt: ts,
      };
      list.push(rec);
      return clone(rec);
    });
  },

  async updateFaqEntry(id, patch, updatedBy) {
    return store.withLock(async () => {
      const f = store.getCollection('faqs').find((x) => x.id === Number(id));
      if (!f) return null;
      if (patch.question !== undefined) f.question = patch.question;
      if (patch.answer !== undefined) f.answer = patch.answer;
      if (patch.isActive !== undefined) f.isActive = Boolean(patch.isActive);
      f.updatedBy = updatedBy ?? null;
      f.updatedAt = nowIso();
      return clone(f);
    });
  },

  async deleteFaqEntry(id) {
    return store.withLock(async () => {
      const list = store.getCollection('faqs');
      const idx = list.findIndex((x) => x.id === Number(id));
      if (idx === -1) return false;
      list.splice(idx, 1);
      return true;
    });
  },

  async reorderFaqEntries(ids, updatedBy) {
    return store.withLock(async () => {
      const list = store.getCollection('faqs');
      ids.forEach((id, i) => {
        const f = list.find((x) => x.id === Number(id));
        if (f) {
          f.sortOrder = i + 1;
          f.updatedBy = updatedBy ?? null;
          f.updatedAt = nowIso();
        }
      });
      return list.map(clone).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    });
  },

  // ---------- Content block ----------
  async listBlockRows() {
    return store.getCollection('contentBlocks').map(clone);
  },

  async getBlockRow(key) {
    const b = store.getCollection('contentBlocks').find((x) => x.key === key);
    return b ? clone(b) : null;
  },

  async upsertBlockRow(key, value, updatedBy) {
    return store.withLock(async () => {
      const list = store.getCollection('contentBlocks');
      let b = list.find((x) => x.key === key);
      if (!b) {
        b = { key };
        list.push(b);
      }
      b.value = clone(value);
      b.updatedBy = updatedBy ?? null;
      b.updatedAt = nowIso();
      return clone(b);
    });
  },
};

module.exports = contentRepo;
