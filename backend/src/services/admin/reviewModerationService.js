const { reviewRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');

const reviewModerationService = {
  async getReviews(query = {}) {
    const { rating, isVisible, search, page = 1, limit = 20 } = query;
    const filter = {};
    if (rating) filter.rating = Number(rating);
    if (isVisible !== undefined && isVisible !== 'all') {
      filter.isVisible = isVisible === 'true' || isVisible === true;
    }
    if (search) filter.search = search;

    return reviewRepo.findAll(filter, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  },

  async setVisibility(id, isVisible, hiddenReason, reqContext = {}) {
    const review = await reviewRepo.findById(id);
    if (!review) {
      throw new AppError('Ulasan tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const visibleBool = Boolean(isVisible);

    return transaction(async (tx) => {
      const updated = await tx.reviewRepo.setVisibility(id, visibleBool, hiddenReason);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        visibleBool ? 'UNHIDE_REVIEW' : 'HIDE_REVIEW',
        'Review',
        id,
        { isVisible: review.isVisible !== false },
        { isVisible: visibleBool, hiddenReason }
      );

      return updated;
    });
  },
};

module.exports = reviewModerationService;
