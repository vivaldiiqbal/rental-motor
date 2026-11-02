const contentService = require('../services/contentService');
const { successResponse } = require('../utils/response');

const contentController = {
  async getPage(req, res) {
    const data = await contentService.getPublicPage(req.params.slug);
    res.set('Cache-Control', 'no-cache');
    return successResponse(res, { data });
  },

  async getFaqs(req, res) {
    const data = await contentService.getPublicFaqs();
    res.set('Cache-Control', 'no-cache');
    return successResponse(res, { data });
  },

  async getBlocks(req, res) {
    const data = await contentService.getPublicBlocks();
    res.set('Cache-Control', 'no-cache');
    return successResponse(res, { data });
  },
};

module.exports = contentController;
