const motorService = require('../services/motorService');
const availabilityService = require('../services/availabilityService');
const reviewService = require('../services/reviewService');
const { successResponse } = require('../utils/response');

const motorController = {
  async getMotorcycles(req, res) {
    const result = await motorService.getMotorcycles(req.query, req.user);
    return successResponse(res, {
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  },

  async getFeatured(req, res) {
    const limit = parseInt(req.query.limit, 10) || 6;
    const motors = await motorService.getFeatured(limit, req.user);
    return successResponse(res, {
      data: motors,
    });
  },

  async getFilters(req, res) {
    const filters = await motorService.getFilters();
    return successResponse(res, {
      data: filters,
    });
  },

  async getMotorDetail(req, res) {
    const motor = await motorService.getMotorDetail(req.params.idOrSlug, req.user);
    return successResponse(res, {
      data: motor,
    });
  },

  async getUnavailableDates(req, res) {
    const { from, to } = req.query;
    const dates = await availabilityService.getUnavailableDates(req.params.id, from, to);
    return successResponse(res, {
      data: dates,
    });
  },

  async getAvailability(req, res) {
    const { start, end } = req.query;
    const result = await availabilityService.checkAvailabilityWithNext(req.params.id, start, end);
    return successResponse(res, {
      data: result,
    });
  },

  async getReviews(req, res) {
    const { page, limit, sort } = req.query;
    const result = await reviewService.getMotorReviews(req.params.id, { page, limit }, sort);
    return successResponse(res, {
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      message: undefined,
      // Ringkasan ulasan (averageRating, totalReviews, ratingDistribution)
      summary: result.summary,
    });
  },

  async getSimilar(req, res) {
    const limit = parseInt(req.query.limit, 10) || 4;
    const motors = await motorService.getSimilar(req.params.id, limit);
    return successResponse(res, {
      data: motors,
    });
  },

  async getRentalOptions(req, res) {
    const options = await motorService.getRentalOptions();
    return successResponse(res, {
      data: options,
    });
  },
};

module.exports = motorController;
