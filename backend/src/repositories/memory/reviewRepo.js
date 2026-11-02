const store = require('../store');

/**
 * Kontrak Review Repository:
 * - findById(id): Promise<Review | null>
 * - findByMotorId(motorId, paging): Promise<{ items: Review[], total: number }>
 * - findByUserId(userId): Promise<Review[]>
 * - calculateStats(motorId): Promise<{ rating: number, reviewCount: number }>
 * - create(data): Promise<Review>
 * - delete(id): Promise<boolean>
 */
const reviewRepo = {
  async findById(id) {
    const reviews = store.getCollection('reviews');
    const motors = store.getCollection('motorcycles');
    const numericId = Number(id);
    const review = reviews.find((r) => r.id === numericId || String(r.id) === String(id));
    if (!review) return null;
    const motor = motors.find((m) => Number(m.id) === Number(review.motorId || review.motorcycleId));
    return {
      ...review,
      motorcycleName: motor ? motor.name : (review.motorcycleName || 'Motor'),
      status: review.isVisible !== false ? 'published' : 'hidden',
    };
  },

  async findByMotorId(motorId, paging = {}) {
    const numericMotorId = Number(motorId);
    let list = store
      .getCollection('reviews')
      .filter((r) => Number(r.motorId) === numericMotorId && r.isVisible !== false)
      .map((r) => ({ ...r }));

    // Urutkan tanggal terbaru
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 20;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async findAll(filter = {}, paging = {}) {
    const motors = store.getCollection('motorcycles');
    let list = store.getCollection('reviews').map((r) => {
      const motor = motors.find((m) => Number(m.id) === Number(r.motorId || r.motorcycleId));
      return {
        ...r,
        motorcycleName: motor ? motor.name : (r.motorcycleName || 'Motor'),
        status: r.isVisible !== false ? 'published' : 'hidden',
      };
    });

    if (filter.rating) {
      list = list.filter((r) => Number(r.rating) === Number(filter.rating));
    }
    if (filter.isVisible !== undefined) {
      list = list.filter((r) => Boolean(r.isVisible !== false) === Boolean(filter.isVisible));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (r) =>
          (r.userName && r.userName.toLowerCase().includes(q)) ||
          (r.comment && r.comment.toLowerCase().includes(q)),
      );
    }

    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 10;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async setVisibility(id, isVisible, hiddenReason = null) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const index = data.reviews.findIndex((r) => r.id === numericId || String(r.id) === String(id));
      if (index === -1) return null;

      data.reviews[index].isVisible = isVisible;
      data.reviews[index].hiddenReason = hiddenReason || null;
      data.reviews[index].moderatedAt = new Date().toISOString();

      const motorId = data.reviews[index].motorId;
      if (motorId) {
        const visibleReviews = data.reviews.filter(
          (r) => Number(r.motorId) === Number(motorId) && r.isVisible !== false,
        );
        const motorIndex = data.motors.findIndex((m) => Number(m.id) === Number(motorId));
        if (motorIndex !== -1) {
          const total = visibleReviews.length;
          const sum = visibleReviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
          const avg = total > 0 ? Math.round((sum / total) * 10) / 10 : 5.0;
          data.motors[motorIndex].rating = avg;
          data.motors[motorIndex].ratingAvg = avg;
          data.motors[motorIndex].reviewCount = total;
        }
      }

      return { ...data.reviews[index] };
    });
  },

  async findByUserId(userId) {
    const numericUserId = Number(userId);
    return store
      .getCollection('reviews')
      .filter((r) => Number(r.userId) === numericUserId)
      .map((r) => ({ ...r }));
  },

  async findByBookingId(bookingId) {
    const numericBookingId = Number(bookingId);
    const reviews = store.getCollection('reviews');
    const review = reviews.find((r) => Number(r.bookingId) === numericBookingId);
    return review ? { ...review } : null;
  },

  async calculateStats(motorId) {
    const numericMotorId = Number(motorId);
    const reviews = store
      .getCollection('reviews')
      .filter((r) => Number(r.motorId) === numericMotorId && r.isVisible !== false);
    if (reviews.length === 0) {
      return { rating: 5.0, reviewCount: 0 };
    }
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    const avg = sum / reviews.length;
    return {
      rating: Math.round(avg * 10) / 10,
      reviewCount: reviews.length,
    };
  },

  async recalcRatings(motorId) {
    return store.withLock(async (data) => {
      const numericMotorId = Number(motorId);
      const reviews = data.reviews.filter(
        (r) => Number(r.motorId) === numericMotorId && r.isVisible !== false,
      );
      const motorIndex = data.motors.findIndex((m) => Number(m.id) === numericMotorId);
      if (motorIndex === -1) return null;

      const total = reviews.length;
      const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      const avg = total > 0 ? Math.round((sum / total) * 10) / 10 : 5.0;

      data.motors[motorIndex].rating = avg;
      data.motors[motorIndex].ratingAvg = avg;
      data.motors[motorIndex].reviewCount = total;

      return {
        rating: avg,
        ratingAvg: avg,
        rating_avg: avg,
        reviewCount: total,
        rating_count: total,
      };
    });
  },

  async create(reviewData) {
    return store.withLock(async (data) => {
      const nextId = data.reviews.length > 0 ? Math.max(...data.reviews.map((r) => Number(r.id) || 0)) + 1 : 1;
      const newReview = {
        id: nextId,
        date: new Date().toISOString().slice(0, 10),
        ...reviewData,
      };
      data.reviews.unshift(newReview);

      // Otomatis sinkronisasi rating & reviewCount di tabel motors
      const motorIndex = data.motors.findIndex((m) => Number(m.id) === Number(newReview.motorId));
      if (motorIndex !== -1) {
        const motorReviews = data.reviews.filter((r) => Number(r.motorId) === Number(newReview.motorId));
        const avg = motorReviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / motorReviews.length;
        data.motors[motorIndex].rating = Math.round(avg * 10) / 10;
        data.motors[motorIndex].reviewCount = motorReviews.length;
      }

      return { ...newReview };
    });
  },

  async delete(id) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const initialLength = data.reviews.length;
      data.reviews = data.reviews.filter((r) => r.id !== numericId && String(r.id) !== String(id));
      return data.reviews.length < initialLength;
    });
  },
};

module.exports = reviewRepo;
