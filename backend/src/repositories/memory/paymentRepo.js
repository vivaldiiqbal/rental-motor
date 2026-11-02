const store = require('../store');

/**
 * Kontrak Payment Repository:
 * - findByBookingId(bookingId): Promise<Payment | null>
 * - findById(id): Promise<Payment | null>
 * - create(data): Promise<Payment>
 * - update(id, data): Promise<Payment | null>
 */
const paymentRepo = {
  async findById(id) {
    const list = store.getCollection('payments') || [];
    const found = list.find((p) => p.id === id || String(p.id) === String(id));
    return found ? { ...found } : null;
  },

  async findByBookingId(bookingId) {
    const numericBookingId = Number(bookingId);
    const list = store.getCollection('payments') || [];
    const found = list.find((p) => Number(p.bookingId) === numericBookingId);
    if (found) return { ...found };

    const bookings = store.getCollection('bookings');
    const booking = bookings.find((b) => b.id === numericBookingId || String(b.id) === String(bookingId));
    if (!booking) return null;

    return {
      id: `PAY-${booking.id}`,
      bookingId: booking.id,
      code: booking.code,
      method: booking.paymentMethod || booking.payment || 'bank_transfer',
      amount: booking.total,
      deposit: booking.deposit,
      status: booking.status === 'confirmed' || booking.status === 'active' || booking.status === 'completed' || booking.paidAt ? 'paid' : (booking.status === 'cancelled' ? (Number(booking.refundAmount || 0) > 0 ? 'refunded' : 'cancelled') : 'pending'),
      createdAt: booking.createdAt,
    };
  },

  async create(paymentData) {
    return store.withLock(async (data) => {
      if (!data.payments) data.payments = [];
      const id = paymentData.id || `PAY-${Date.now()}`;
      const rec = {
        id,
        ...paymentData,
        createdAt: new Date().toISOString(),
      };
      data.payments.push(rec);
      return { ...rec };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      if (!data.payments) data.payments = [];
      const idx = data.payments.findIndex((p) => p.id === id || String(p.id) === String(id));
      if (idx === -1) return null;
      data.payments[idx] = {
        ...data.payments[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      return { ...data.payments[idx] };
    });
  },
};

module.exports = paymentRepo;
