const reviewService = require('../services/reviewService');
const { successResponse } = require('../utils/response');
const { getPaginationMeta } = require('../utils/pagination');

const reviewController = {
  async getMotorReviews(req, res) {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = await reviewService.getReviewsByMotorId(req.params.motorId, { page, limit });
    const meta = getPaginationMeta(result.total, page, limit);

    return successResponse(res, {
      data: result.items,
      meta,
    });
  },

  async addReview(req, res) {
    const review = await reviewService.addReview(req.body, req.user);
    return successResponse(res, {
      data: review,
      statusCode: 201,
      message: 'Ulasan Anda berhasil ditambahkan. Terima kasih atas masukan Anda!',
    });
  },
};

module.exports = reviewController;
