const contactService = require('../services/contactService');
const { successResponse } = require('../utils/response');

const contactController = {
  async sendMessage(req, res) {
    const result = await contactService.sendContactMessage(req.body);
    return successResponse(res, {
      data: result,
      statusCode: 201,
      message: result.message,
    });
  },
};

module.exports = contactController;
