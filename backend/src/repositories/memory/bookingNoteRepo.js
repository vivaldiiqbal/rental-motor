const store = require('../store');

/**
 * Kontrak Booking Note Repository:
 * - findByBookingId(bookingId): Promise<BookingNote[]>
 * - create(data): Promise<BookingNote>
 */
const bookingNoteRepo = {
  async findByBookingId(bookingId) {
    const list = store.getCollection('bookingNotes');
    const numericBookingId = Number(bookingId);
    return list
      .filter((n) => n.bookingId === numericBookingId || String(n.bookingId) === String(bookingId))
      .map((n) => ({ ...n }));
  },

  async create(payload) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.bookingNotes)) {
        data.bookingNotes = [];
      }
      const nextId =
        data.bookingNotes.length > 0
          ? Math.max(...data.bookingNotes.map((n) => Number(n.id) || 0)) + 1
          : 1;

      const record = {
        id: nextId,
        createdAt: new Date().toISOString(),
        ...payload,
      };

      data.bookingNotes.push(record);
      return { ...record };
    });
  },
};

module.exports = bookingNoteRepo;
