const calendarService = require('../../services/admin/calendarService');
const { successResponse } = require('../../utils/response');

const calendarController = {
  async getCalendar(req, res) {
    const data = await calendarService.getCalendarMatrix(req.query.month);
    return successResponse(res, { data });
  },
};

module.exports = calendarController;
