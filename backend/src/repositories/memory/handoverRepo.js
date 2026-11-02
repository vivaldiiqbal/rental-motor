const store = require('../store');

/**
 * Kontrak Handover Repository:
 * - findByBookingId(bookingId): Promise<Handover | null>
 * - create(data): Promise<Handover>
 */
const handoverRepo = {
  async findByBookingId(bookingId) {
    const list = store.getCollection('handovers');
    const numericBookingId = Number(bookingId);
    const item = list.find(
      (h) => h.bookingId === numericBookingId || String(h.bookingId) === String(bookingId),
    );
    return item ? { ...item } : null;
  },

  async create(payload) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.handovers)) {
        data.handovers = [];
      }
      const nextId =
        data.handovers.length > 0
          ? Math.max(...data.handovers.map((h) => Number(h.id) || 0)) + 1
          : 1;

      const record = {
        id: nextId,
        createdAt: new Date().toISOString(),
        ...payload,
      };

      data.handovers.push(record);
      return { ...record };
    });
  },
};

module.exports = handoverRepo;
