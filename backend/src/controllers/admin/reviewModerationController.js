const reviewModerationService = require('../../services/admin/reviewModerationService');
const { successResponse } = require('../../utils/response');

const reviewModerationController = {
  async getReviews(req, res) {
    const result = await reviewModerationService.getReviews(req.query);
    return successResponse(res, {
      data: result.items,
      meta: {
        total: result.total,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      },
    });
  },

  async setVisibility(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    let isVisible = req.body.isVisible;
    if (isVisible === undefined && req.body.status !== undefined) {
      isVisible = req.body.status === 'published' || req.body.status === 'active';
    }
    const review = await reviewModerationService.setVisibility(
      req.params.id,
      isVisible,
      req.body.hiddenReason,
      reqContext
    );
    return successResponse(res, {
      data: review,
      message: `Status visibilitas ulasan berhasil diubah menjadi ${isVisible ? 'tampil' : 'disembunyikan'}.`,
    });
  },
};

module.exports = reviewModerationController;
