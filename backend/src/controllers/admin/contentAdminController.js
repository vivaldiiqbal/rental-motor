const contentService = require('../../services/contentService');
const AppError = require('../../utils/AppError');
const { successResponse } = require('../../utils/response');

const ctxOf = (req) => ({ user: req.user, ip: req.ip, headers: req.headers });

function intParam(value, label) {
  if (!/^\d+$/.test(String(value))) throw new AppError(`${label} tidak valid.`, 'VALIDATION_ERROR', 400);
  return Number(value);
}

const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

const contentAdminController = {
  // ---- Halaman ----
  async listPages(req, res) {
    return successResponse(res, { data: await contentService.listPages() });
  },
  async getPage(req, res) {
    return successResponse(res, { data: await contentService.getPage(req.params.slug) });
  },
  async updatePage(req, res) {
    const data = await contentService.updatePage(req.params.slug, body(req), ctxOf(req));
    return successResponse(res, { data, message: `Halaman disimpan sebagai versi ${data.version}.` });
  },
  async setPublished(req, res) {
    const data = await contentService.setPagePublished(req.params.slug, body(req).isPublished, ctxOf(req));
    return successResponse(res, {
      data,
      message: data.isPublished ? 'Halaman ditampilkan.' : 'Halaman disembunyikan.',
    });
  },
  async listVersions(req, res) {
    return successResponse(res, { data: await contentService.listVersions(req.params.slug) });
  },
  async getVersion(req, res) {
    const v = intParam(req.params.version, 'Versi');
    return successResponse(res, { data: await contentService.getVersion(req.params.slug, v) });
  },
  async restoreVersion(req, res) {
    const v = intParam(req.params.version, 'Versi');
    const data = await contentService.restoreVersion(req.params.slug, v, ctxOf(req));
    return successResponse(res, { data, message: `Versi ${v} dipulihkan sebagai versi ${data.version}.` });
  },
  async preview(req, res) {
    const html = await contentService.previewMarkdown(body(req).body);
    return successResponse(res, { data: { html } });
  },

  // ---- FAQ ----
  async listFaqs(req, res) {
    return successResponse(res, { data: await contentService.listFaqs() });
  },
  async createFaq(req, res) {
    const data = await contentService.createFaq(body(req), ctxOf(req));
    return successResponse(res, { data, message: 'FAQ ditambahkan.', statusCode: 201 });
  },
  async updateFaq(req, res) {
    const data = await contentService.updateFaq(intParam(req.params.id, 'ID FAQ'), body(req), ctxOf(req));
    return successResponse(res, { data, message: 'FAQ diperbarui.' });
  },
  async deleteFaq(req, res) {
    const data = await contentService.deleteFaq(intParam(req.params.id, 'ID FAQ'), ctxOf(req));
    return successResponse(res, { data, message: 'FAQ dihapus.' });
  },
  async reorderFaqs(req, res) {
    const data = await contentService.reorderFaqs(body(req).ids, ctxOf(req));
    return successResponse(res, { data, message: 'Urutan FAQ diperbarui.' });
  },

  // ---- Content block ----
  async listBlocks(req, res) {
    return successResponse(res, { data: await contentService.listBlocks() });
  },
  async updateBlock(req, res) {
    const data = await contentService.updateBlock(req.params.key, body(req).value, ctxOf(req));
    return successResponse(res, { data, message: 'Content block diperbarui.' });
  },
};

module.exports = contentAdminController;
