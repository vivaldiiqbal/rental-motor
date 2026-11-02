const store = require('../store');

/**
 * Kontrak Return Repository:
 * - findByBookingId(bookingId): Promise<ReturnRecord | null>
 * - create(data): Promise<ReturnRecord>
 */
const returnRepo = {
  async findByBookingId(bookingId) {
    const list = store.getCollection('returns');
    const numericBookingId = Number(bookingId);
    const item = list.find(
      (r) => r.bookingId === numericBookingId || String(r.bookingId) === String(bookingId),
    );
    return item ? { ...item } : null;
  },

  async create(payload) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.returns)) {
        data.returns = [];
      }
      const nextId =
        data.returns.length > 0
          ? Math.max(...data.returns.map((r) => Number(r.id) || 0)) + 1
          : 1;

      const record = {
        id: nextId,
        createdAt: new Date().toISOString(),
        ...payload,
      };

      data.returns.push(record);
      return { ...record };
    });
  },

  async updateDepositRefundStatus(bookingId, patch = {}) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.returns)) data.returns = [];
      const item = data.returns.find(
        (r) =>
          (r.bookingId === Number(bookingId) || String(r.bookingId) === String(bookingId)) &&
          !r.depositRefundedAt &&
          Number(r.depositRefund) > 0,
      );
      if (!item) return null;
      item.depositRefundedAt = patch.depositRefundedAt || new Date().toISOString();
      if (patch.depositRefundedBy) item.depositRefundedBy = patch.depositRefundedBy;
      return { ...item };
    });
  },
};

module.exports = returnRepo;
