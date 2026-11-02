const messageService = require('../../services/admin/messageService');
const { successResponse } = require('../../utils/response');

const messageController = {
  async getMessages(req, res) {
    const result = await messageService.getMessages(req.query);
    return successResponse(res, {
      data: result.items,
      meta: {
        total: result.total,
        unreadCount: result.unreadCount,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      },
    });
  },

  async markRead(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const updated = await messageService.markMessageRead(req.params.id, reqContext);
    return successResponse(res, {
      data: updated,
      message: 'Pesan telah ditandai sebagai dibaca.',
    });
  },

  async replyMessage(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const replyText = req.body.replyText || req.body.message || req.body.replyNote || req.body.reply;
    const updated = await messageService.replyMessage(req.params.id, replyText, reqContext);
    return successResponse(res, {
      data: updated,
      message: 'Balasan pesan berhasil disimpan.',
    });
  },
};

module.exports = messageController;
