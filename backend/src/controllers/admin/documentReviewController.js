const documentReviewService = require('../../services/admin/documentReviewService');
const { successResponse } = require('../../utils/response');

const documentReviewController = {
  async getDocuments(req, res) {
    const result = await documentReviewService.getDocuments(req.query, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return successResponse(res, {
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    });
  },

  async getDocumentFile(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const { stream, contentType, filename } = await documentReviewService.getDocumentFile(
      req.params.userId,
      req.params.type,
      reqContext
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    stream.pipe(res);
  },

  async verifyDocument(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await documentReviewService.verifyDocument(
      req.params.userId,
      req.params.type,
      req.body,
      reqContext
    );
    return successResponse(res, {
      data: result,
      message: `Verifikasi dokumen ${req.params.type.toUpperCase()} berhasil disimpan.`,
    });
  },
};

module.exports = documentReviewController;
