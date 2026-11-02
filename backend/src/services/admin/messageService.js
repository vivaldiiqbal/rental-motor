const { contactRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');

const messageService = {
  async getMessages(query = {}) {
    const { search, isRead, page = 1, limit = 20 } = query;
    const res = await contactRepo.findAll({ page: 1, limit: 1000 });
    let items = res.items;

    if (isRead !== undefined && isRead !== 'all') {
      const readBool = isRead === 'true' || isRead === true;
      items = items.filter((m) => Boolean(m.read) === readBool);
    }

    if (search) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (m) =>
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.email && m.email.toLowerCase().includes(q)) ||
          (m.message && m.message.toLowerCase().includes(q)) ||
          (m.subject && m.subject.toLowerCase().includes(q))
      );
    }

    const total = items.length;
    const p = Number(page) || 1;
    const l = Number(limit) || 20;
    const offset = (p - 1) * l;
    const paginatedItems = items.slice(offset, offset + l);
    const unreadCount = await contactRepo.countUnread();

    return {
      items: paginatedItems,
      total,
      unreadCount,
    };
  },

  async markMessageRead(id, reqContext = {}) {
    const existing = await contactRepo.findById(id);
    if (!existing) {
      throw new AppError('Pesan kontak tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    return transaction(async (tx) => {
      const updated = await contactRepo.markRead(id);

      await recordAudit(
        reqContext,
        'MARK_MESSAGE_READ',
        'ContactMessage',
        id,
        { read: existing.read },
        { read: true }
      );

      return updated;
    });
  },

  async replyMessage(id, replyText, reqContext = {}) {
    const existing = await contactRepo.findById(id);
    if (!existing) {
      throw new AppError('Pesan kontak tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    if (!replyText || !String(replyText).trim()) {
      throw new AppError('Isi balasan tidak boleh kosong', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return transaction(async (tx) => {
      const updated = await contactRepo.reply(id, String(replyText).trim(), reqContext.user?.id);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'REPLY_MESSAGE',
        'ContactMessage',
        id,
        existing,
        updated
      );

      return updated;
    });
  },
};

module.exports = messageService;
