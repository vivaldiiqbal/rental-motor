const { contentRepo, transaction } = require('../repositories');
const { recordAudit } = require('../middleware/audit');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const settingsService = require('./admin/settingsService');
const { renderMarkdown, buildPlaceholderVars } = require('../utils/markdown');
const {
  PAGE_SLUGS,
  DEFAULT_PAGES,
  DEFAULT_BLOCKS,
  BLOCK_KEYS,
  validateBlockValue,
} = require('../config/contentDefaults');

const MAX_TITLE = 200;
const MAX_BODY = 50000;
const MAX_NOTE = 300;
const MAX_QUESTION = 300;
const MAX_ANSWER = 5000;

const bad = (msg) => new AppError(msg, 'VALIDATION_ERROR', 400);
const notFound = (msg) => new AppError(msg, 'NOT_FOUND', 404);

function actorIdOf(ctx) {
  const n = Number(ctx?.user?.id);
  return Number.isInteger(n) ? n : null;
}

async function placeholderVars() {
  try {
    return buildPlaceholderVars(await settingsService.getSettings());
  } catch (err) {
    logger.warn(`[content] gagal memuat pengaturan untuk placeholder: ${err.message}`);
    return {};
  }
}

function assertSlug(slug) {
  if (!PAGE_SLUGS.includes(slug)) throw notFound('Halaman tidak ditemukan.');
}

function validatePageInput({ title, body, note }) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE) {
    throw bad(`Judul wajib diisi (1 sampai ${MAX_TITLE} karakter).`);
  }
  if (typeof body !== 'string') throw bad('Isi halaman harus berupa teks.');
  if (body.length > MAX_BODY) throw bad(`Isi halaman maksimal ${MAX_BODY} karakter.`);
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > MAX_NOTE) throw bad(`Catatan perubahan maksimal ${MAX_NOTE} karakter.`);
  }
  return { title: title.trim(), body, note: note ? note.trim() : null };
}

const pageSnapshot = (p) =>
  p && { slug: p.slug, title: p.title, body: p.body, version: p.version, isPublished: p.isPublished };

/** Pastikan baris halaman ada (berisi default sebagai versi 1). Aman terhadap balapan. */
async function materializePage(tx, slug) {
  const def = DEFAULT_PAGES[slug];
  const created = await tx.contentRepo.createPageIfAbsent({
    slug,
    title: def.title,
    body: def.body,
    version: 1,
    isPublished: true,
    updatedBy: null,
  });
  if (created) {
    await tx.contentRepo.insertPageVersion(created.id, {
      version: 1,
      title: def.title,
      body: def.body,
      changeNote: 'Konten awal bawaan sistem',
      createdBy: null,
    });
  }
}

const contentService = {
  // =============== PUBLIK ===============
  async getPublicPage(slug) {
    assertSlug(slug);
    let row = null;
    try {
      row = await contentRepo.getPageBySlug(slug);
    } catch (err) {
      logger.warn(`[content] gagal membaca halaman ${slug}, memakai default: ${err.message}`);
    }

    const def = DEFAULT_PAGES[slug];
    let page;
    if (row && typeof row.body === 'string' && typeof row.title === 'string' && row.title) {
      if (row.isPublished === false) {
        throw new AppError('Halaman ini sedang tidak ditampilkan.', 'PAGE_UNAVAILABLE', 404);
      }
      page = { title: row.title, body: row.body, version: row.version, updatedAt: row.updatedAt };
    } else {
      page = { title: def.title, body: def.body, version: 0, updatedAt: null };
    }

    return {
      slug,
      title: page.title,
      bodyHtml: renderMarkdown(page.body, await placeholderVars()),
      version: page.version,
      updatedAt: page.updatedAt,
    };
  },

  async getPublicFaqs() {
    let rows = [];
    try {
      rows = await contentRepo.listFaqEntries(true);
    } catch (err) {
      logger.warn(`[content] gagal membaca FAQ: ${err.message}`);
      return [];
    }
    const vars = await placeholderVars();
    return rows
      .filter((f) => typeof f.question === 'string' && typeof f.answer === 'string')
      .map((f) => ({ id: f.id, question: f.question, answerHtml: renderMarkdown(f.answer, vars) }));
  },

  /** Nilai efektif tiap block: DB bila valid, selain itu default. */
  async _effectiveBlocks() {
    let rows = [];
    try {
      rows = await contentRepo.listBlockRows();
    } catch (err) {
      logger.warn(`[content] gagal membaca content block: ${err.message}`);
    }
    const out = {};
    for (const key of BLOCK_KEYS) {
      const row = rows.find((r) => r.key === key);
      let value = DEFAULT_BLOCKS[key];
      let isDefault = true;
      let updatedAt = null;
      if (row) {
        const check = validateBlockValue(key, row.value);
        if (check.ok) {
          value = check.value;
          isDefault = false;
          updatedAt = row.updatedAt;
        }
      }
      out[key] = { value, isDefault, updatedAt };
    }
    return out;
  },

  async getPublicBlocks(now = new Date()) {
    const eff = await this._effectiveBlocks();
    const a = eff.announcement.value;
    let announcement = null;
    if (a && a.isActive && a.text) {
      const started = !a.startsAt || new Date(a.startsAt) <= now;
      const notEnded = !a.endsAt || new Date(a.endsAt) >= now;
      if (started && notEnded) {
        announcement = { text: a.text, linkUrl: a.linkUrl || '', linkLabel: a.linkLabel || '' };
      }
    }
    return {
      heroTitle: eff.heroTitle.value,
      heroSubtitle: eff.heroSubtitle.value,
      ctaText: eff.ctaText.value,
      announcement,
    };
  },

  /**
   * Tentukan versi Syarat Sewa yang dicatat pada booking.
   * Versi yang dikirim klien dipakai hanya bila benar-benar ada di riwayat;
   * selain itu dipakai versi terbit saat ini (0 = konten bawaan sistem).
   */
  async resolveTermsVersion(acceptedVersion) {
    let page = null;
    try {
      page = await contentRepo.getPageBySlug('terms');
    } catch (err) {
      logger.warn(`[content] gagal membaca versi Syarat: ${err.message}`);
    }
    const current = page && Number.isInteger(page.version) ? page.version : 0;
    if (acceptedVersion === undefined || acceptedVersion === null || acceptedVersion === current) return current;
    if (page && Number.isInteger(acceptedVersion) && acceptedVersion > 0) {
      try {
        const v = await contentRepo.getPageVersion(page.id, acceptedVersion);
        if (v) return v.version;
      } catch {
        /* abaikan, pakai versi saat ini */
      }
    }
    return current;
  },

  // =============== ADMIN: HALAMAN ===============
  async ensureDefaultPages() {
    const existing = await contentRepo.listPages();
    const have = new Set(existing.map((p) => p.slug));
    const missing = PAGE_SLUGS.filter((s) => !have.has(s));
    if (missing.length === 0) return;
    await transaction(async (tx) => {
      for (const slug of missing) await materializePage(tx, slug);
    });
  },

  async listPages() {
    await this.ensureDefaultPages();
    const rows = await contentRepo.listPages();
    return PAGE_SLUGS.map((s) => rows.find((r) => r.slug === s))
      .filter(Boolean)
      .map(({ body, ...meta }) => ({ ...meta, bodyLength: body.length }));
  },

  async getPage(slug) {
    assertSlug(slug);
    await this.ensureDefaultPages();
    const page = await contentRepo.getPageBySlug(slug);
    if (!page) throw notFound('Halaman tidak ditemukan.');
    return page;
  },

  async _saveNewVersion(tx, slug, { title, body, note }, ctx, action) {
    await materializePage(tx, slug);
    const before = await tx.contentRepo.getPageBySlugForUpdate(slug);
    if (!before) throw notFound('Halaman tidak ditemukan.');
    const version = before.version + 1;
    const updatedBy = actorIdOf(ctx);
    const after = await tx.contentRepo.savePageContent(slug, { title, body, version, updatedBy });
    await tx.contentRepo.insertPageVersion(before.id, {
      version,
      title,
      body,
      changeNote: note,
      createdBy: updatedBy,
    });
    await recordAudit(tx.auditRepo, ctx, action, 'Page', slug, pageSnapshot(before), pageSnapshot(after));
    return after;
  },

  async updatePage(slug, input, ctx = {}) {
    assertSlug(slug);
    const clean = validatePageInput(input || {});
    return transaction((tx) => this._saveNewVersion(tx, slug, clean, ctx, 'UPDATE_PAGE'));
  },

  async setPagePublished(slug, isPublished, ctx = {}) {
    assertSlug(slug);
    if (typeof isPublished !== 'boolean') throw bad('isPublished harus berupa boolean.');
    return transaction(async (tx) => {
      await materializePage(tx, slug);
      const before = await tx.contentRepo.getPageBySlugForUpdate(slug);
      if (!before) throw notFound('Halaman tidak ditemukan.');
      const after = await tx.contentRepo.setPagePublished(slug, isPublished, actorIdOf(ctx));
      await recordAudit(tx.auditRepo, ctx, 'PUBLISH_PAGE', 'Page', slug, pageSnapshot(before), pageSnapshot(after));
      return after;
    });
  },

  async listVersions(slug) {
    const page = await this.getPage(slug);
    const versions = await contentRepo.listPageVersions(page.id);
    return versions.map(({ body, pageId, ...meta }) => ({ ...meta, bodyLength: body.length }));
  },

  async getVersion(slug, version) {
    const page = await this.getPage(slug);
    const v = await contentRepo.getPageVersion(page.id, version);
    if (!v) throw notFound('Versi tidak ditemukan.');
    return v;
  },

  async restoreVersion(slug, version, ctx = {}) {
    assertSlug(slug);
    return transaction(async (tx) => {
      await materializePage(tx, slug);
      const page = await tx.contentRepo.getPageBySlug(slug);
      const v = await tx.contentRepo.getPageVersion(page.id, version);
      if (!v) throw notFound('Versi tidak ditemukan.');
      return this._saveNewVersion(
        tx,
        slug,
        { title: v.title, body: v.body, note: `Dipulihkan dari versi ${v.version}` },
        ctx,
        'RESTORE_PAGE',
      );
    });
  },

  async previewMarkdown(body) {
    if (typeof body !== 'string') throw bad('Isi harus berupa teks.');
    if (body.length > MAX_BODY) throw bad(`Isi maksimal ${MAX_BODY} karakter.`);
    return renderMarkdown(body, await placeholderVars());
  },

  // =============== ADMIN: FAQ ===============
  _validateFaq(input, partial = false) {
    const out = {};
    if (!partial || input.question !== undefined) {
      if (typeof input.question !== 'string' || !input.question.trim() || input.question.trim().length > MAX_QUESTION) {
        throw bad(`Pertanyaan wajib diisi (1 sampai ${MAX_QUESTION} karakter).`);
      }
      out.question = input.question.trim();
    }
    if (!partial || input.answer !== undefined) {
      if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.trim().length > MAX_ANSWER) {
        throw bad(`Jawaban wajib diisi (1 sampai ${MAX_ANSWER} karakter).`);
      }
      out.answer = input.answer.trim();
    }
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean') throw bad('isActive harus berupa boolean.');
      out.isActive = input.isActive;
    }
    return out;
  },

  async listFaqs() {
    return contentRepo.listFaqEntries(false);
  },

  async createFaq(input, ctx = {}) {
    const data = this._validateFaq(input || {});
    return transaction(async (tx) => {
      const created = await tx.contentRepo.createFaqEntry({ ...data, updatedBy: actorIdOf(ctx) });
      await recordAudit(tx.auditRepo, ctx, 'CREATE_FAQ', 'Faq', created.id, null, created);
      return created;
    });
  },

  async updateFaq(id, input, ctx = {}) {
    const data = this._validateFaq(input || {}, true);
    if (Object.keys(data).length === 0) throw bad('Tidak ada perubahan yang dikirim.');
    return transaction(async (tx) => {
      const before = await tx.contentRepo.getFaqEntry(id);
      if (!before) throw notFound('FAQ tidak ditemukan.');
      const after = await tx.contentRepo.updateFaqEntry(id, data, actorIdOf(ctx));
      await recordAudit(tx.auditRepo, ctx, 'UPDATE_FAQ', 'Faq', id, before, after);
      return after;
    });
  },

  async deleteFaq(id, ctx = {}) {
    return transaction(async (tx) => {
      const before = await tx.contentRepo.getFaqEntry(id);
      if (!before) throw notFound('FAQ tidak ditemukan.');
      await tx.contentRepo.deleteFaqEntry(id);
      await recordAudit(tx.auditRepo, ctx, 'DELETE_FAQ', 'Faq', id, before, null);
      return { id: before.id };
    });
  },

  async reorderFaqs(ids, ctx = {}) {
    if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
      throw bad('ids harus berupa array angka.');
    }
    if (new Set(ids).size !== ids.length) throw bad('ids tidak boleh duplikat.');
    return transaction(async (tx) => {
      const before = await tx.contentRepo.listFaqEntries(false);
      const existing = new Set(before.map((f) => f.id));
      if (ids.length !== existing.size || ids.some((x) => !existing.has(x))) {
        throw bad('ids harus memuat seluruh FAQ yang ada, tepat satu kali.');
      }
      const after = await tx.contentRepo.reorderFaqEntries(ids, actorIdOf(ctx));
      await recordAudit(
        tx.auditRepo,
        ctx,
        'REORDER_FAQ',
        'Faq',
        'all',
        { order: before.map((f) => f.id) },
        { order: after.map((f) => f.id) },
      );
      return after;
    });
  },

  // =============== ADMIN: CONTENT BLOCK ===============
  async listBlocks() {
    const eff = await this._effectiveBlocks();
    return BLOCK_KEYS.map((key) => ({ key, ...eff[key] }));
  },

  async updateBlock(key, value, ctx = {}) {
    if (!BLOCK_KEYS.includes(key)) throw notFound('Content block tidak ditemukan.');
    const check = validateBlockValue(key, value);
    if (!check.ok) throw bad(check.error);
    const eff = await this._effectiveBlocks();
    const before = eff[key].value;
    return transaction(async (tx) => {
      const row = await tx.contentRepo.upsertBlockRow(key, check.value, actorIdOf(ctx));
      await recordAudit(tx.auditRepo, ctx, 'UPDATE_CONTENT_BLOCK', 'ContentBlock', key, before, check.value);
      return { key, value: row.value, isDefault: false, updatedAt: row.updatedAt };
    });
  },
};

module.exports = contentService;
