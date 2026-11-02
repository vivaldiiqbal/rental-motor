const store = require('../store');
const { isOverlapping } = require('../../utils/dates');
const { BLOCKING_BOOKING_STATUSES, BOOKING_STATUS } = require('../../config/constants');

/**
 * Kontrak Booking Repository:
 * - findById(id): Promise<Booking | null>
 * - findByCode(code): Promise<Booking | null>
 * - findAll(filter, paging): Promise<{ items: Booking[], total: number }>
 * - findByUserId(userId, filter, paging): Promise<{ items: Booking[], total: number }>
 * - findOverlapping(motorId, start, end, excludeId): Promise<Booking[]>
 * - findBlockedRanges(motorId): Promise<Array<{ from: string, to: string }>>
 * - findExpiredPending(thresholdIso): Promise<Booking[]>
 * - create(data): Promise<Booking>
 * - update(id, data): Promise<Booking | null>
 * - delete(id): Promise<boolean>
 */
const bookingRepo = {
  async findById(id) {
    const bookings = store.getCollection('bookings');
    const numericId = Number(id);
    const booking = bookings.find((b) => b.id === numericId || String(b.id) === String(id));
    return booking ? { ...booking } : null;
  },

  async findByCode(code) {
    if (!code) return null;
    const bookings = store.getCollection('bookings');
    const booking = bookings.find((b) => (b.code || b.bookingCode || '').toUpperCase() === code.trim().toUpperCase());
    return booking ? { ...booking } : null;
  },

  async findAll(filter = {}, paging = {}) {
    let list = store.getCollection('bookings').map((b) => ({ ...b }));

    if (filter.status && filter.status !== 'all') {
      list = list.filter((b) => b.status === filter.status);
    }
    if (filter.motorId) {
      list = list.filter((b) => Number(b.motorId) === Number(filter.motorId));
    }
    if (filter.userId) {
      list = list.filter((b) => Number(b.userId) === Number(filter.userId));
    }
    if (filter.startDate) {
      list = list.filter((b) => b.startDate >= filter.startDate);
    }
    if (filter.endDate) {
      list = list.filter((b) => b.endDate <= filter.endDate);
    }
    if (filter.search) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          (b.code && b.code.toLowerCase().includes(q)) ||
          (b.renter && b.renter.name && b.renter.name.toLowerCase().includes(q)) ||
          (b.renter && b.renter.phone && b.renter.phone.includes(q)) ||
          (b.renter && b.renter.email && b.renter.email.toLowerCase().includes(q)),
      );
    }

    if (filter.sortBy) {
      const order = filter.sortOrder === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const valA = a[filter.sortBy] || '';
        const valB = b[filter.sortBy] || '';
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * order;
        }
        return String(valA).localeCompare(String(valB)) * order;
      });
    } else {
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 10;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async findConflictingForMotor(motorId, fromDate = null) {
    const today = fromDate || new Date().toISOString().slice(0, 10);
    const bookings = store.getCollection('bookings');
    const numericMotorId = Number(motorId);
    return bookings
      .filter(
        (b) =>
          Number(b.motorId) === numericMotorId &&
          BLOCKING_BOOKING_STATUSES.includes(b.status) &&
          b.endDate >= today,
      )
      .map((b) => ({ ...b }));
  },

  async countStatusSummary(filter = {}) {
    let list = store.getCollection('bookings');
    if (filter.motorId) {
      list = list.filter((b) => Number(b.motorId) === Number(filter.motorId));
    }
    const counts = {
      all: list.length,
      pending: 0,
      confirmed: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      expired: 0,
    };
    for (const b of list) {
      if (counts[b.status] !== undefined) counts[b.status]++;
    }
    return counts;
  },

  async findByUserId(userId, filter = {}, paging = {}) {
    return this.findAll({ ...filter, userId }, paging);
  },

  /**
   * Cari booking yang bentrok (overlapping) dengan jadwal yang diminta.
   * Hanya memperhitungkan booking dengan status pending, confirmed, atau active.
   */
  async findOverlapping(motorId, start, end, excludeId = null) {
    const bookings = store.getCollection('bookings');
    const numericMotorId = Number(motorId);
    const numericExcludeId = excludeId !== null ? Number(excludeId) : null;

    return bookings.filter((b) => {
      if (Number(b.motorId) !== numericMotorId) return false;
      if (numericExcludeId && (b.id === numericExcludeId || String(b.id) === String(excludeId))) return false;
      if (!BLOCKING_BOOKING_STATUSES.includes(b.status)) return false;
      return isOverlapping(start, end, b.startDate, b.endDate);
    });
  },

  async countStatusByUserId(userId) {
    const numericUserId = Number(userId);
    const bookings = store.getCollection('bookings').filter((b) => Number(b.userId) === numericUserId);
    const counts = {
      all: bookings.length,
      pending: 0,
      confirmed: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      expired: 0,
    };
    for (const b of bookings) {
      if (counts[b.status] !== undefined) {
        counts[b.status]++;
      }
    }
    return counts;
  },

  async getUnavailableDates(motorId, fromDate = null, toDate = null) {
    const numericMotorId = Number(motorId);
    const today = new Date().toISOString().slice(0, 10);
    const from = fromDate || today;
    const to = toDate || new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

    const bookings = store.getCollection('bookings').filter((b) => {
      if (Number(b.motorId) !== numericMotorId) return false;
      if (!BLOCKING_BOOKING_STATUSES.includes(b.status)) return false;
      return isOverlapping(from, to, b.startDate, b.endDate);
    });

    const serviceBlocks = store.getCollection('serviceBlocks').filter((s) => {
      if (Number(s.motorId) !== numericMotorId) return false;
      if (s.status === 'completed') return false;
      return isOverlapping(from, to, s.startDate, s.endDate);
    });

    const set = new Set();
    const fill = (sStr, eStr) => {
      let cur = new Date(sStr);
      const end = new Date(eStr);
      while (cur < end) {
        const d = cur.toISOString().slice(0, 10);
        if (d >= from && d < to) {
          set.add(d);
        }
        cur.setDate(cur.getDate() + 1);
      }
    };

    bookings.forEach((b) => fill(b.startDate, b.endDate));
    serviceBlocks.forEach((s) => fill(s.startDate, s.endDate));

    return Array.from(set).sort();
  },

  /**
   * Rentang tanggal yang terblokir untuk sebuah motor (booking aktif & blok servis).
   */
  async findBlockedRanges(motorId, fromDate = null, toDate = null) {
    const bookings = store.getCollection('bookings');
    const serviceBlocks = store.getCollection('serviceBlocks');
    const numericMotorId = Number(motorId);

    const isBlocked = (start, end) => {
      if (fromDate && end <= fromDate) return false;
      if (toDate && start >= toDate) return false;
      return true;
    };

    const bList = bookings
      .filter((b) => Number(b.motorId) === numericMotorId && BLOCKING_BOOKING_STATUSES.includes(b.status) && isBlocked(b.startDate, b.endDate))
      .map((b) => ({ from: b.startDate, to: b.endDate, startDate: b.startDate, endDate: b.endDate }));

    const sList = serviceBlocks
      .filter((s) => Number(s.motorId) === numericMotorId && s.status !== 'completed' && isBlocked(s.startDate, s.endDate))
      .map((s) => ({ from: s.startDate, to: s.endDate, startDate: s.startDate, endDate: s.endDate }));

    const all = [...bList, ...sList];
    all.sort((a, b) => a.from.localeCompare(b.from));
    return all;
  },

  /**
   * Cari booking status 'pending' yang telah melewati batas kedaluwarsa.
   */
  async findExpiredPending(thresholdIso) {
    const bookings = store.getCollection('bookings');
    return bookings.filter((b) => b.status === BOOKING_STATUS.PENDING && b.createdAt < thresholdIso);
  },

  async create(bookingData) {
    return store.withLock(async (data) => {
      const nextId = data.bookings.length > 0 ? Math.max(...data.bookings.map((b) => Number(b.id) || 0)) + 1 : 1;
      const newBooking = {
        id: nextId,
        version: Number(bookingData.version || 1),
        paymentMethod: bookingData.paymentMethod || 'bank_transfer',
        status: BOOKING_STATUS.PENDING,
        createdAt: new Date().toISOString(),
        ...bookingData,
      };
      data.bookings.unshift(newBooking);
      return { ...newBooking };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const index = data.bookings.findIndex((b) => b.id === numericId || String(b.id) === String(id));
      if (index === -1) return null;

      const current = data.bookings[index];
      const updated = {
        ...current,
        ...patch,
        version: patch.version !== undefined ? Number(patch.version) : Number(current.version || 1),
        updatedAt: new Date().toISOString(),
      };
      updated.id = current.id;
      data.bookings[index] = updated;
      return { ...updated };
    });
  },

  async delete(id) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const initialLength = data.bookings.length;
      data.bookings = data.bookings.filter((b) => b.id !== numericId && String(b.id) !== String(id));
      return data.bookings.length < initialLength;
    });
  },
};

module.exports = bookingRepo;
