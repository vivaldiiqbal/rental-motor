const { reviewRepo, motorRepo, bookingRepo, store, transaction } = require('../repositories');
const { BOOKING_STATUS } = require('../config/constants');
const AppError = require('../utils/AppError');

/**
 * Menghitung ulang rating rata-rata, jumlah ulasan, dan distribusi rating 1..5 motor.
 */
async function recalcRatings(motorId, tx = null) {
  const repo = tx ? tx.reviewRepo : reviewRepo;
  if (repo && typeof repo.recalcRatings === 'function') {
    return await repo.recalcRatings(motorId);
  }
  const stats = await repo.calculateStats(motorId);
  const mRepo = tx ? tx.motorRepo : motorRepo;
  await mRepo.update(motorId, {
    rating: stats.rating,
    ratingAvg: stats.rating,
    reviewCount: stats.reviewCount,
  });
  return stats;
}

class ReviewService {
  /**
   * Mengambil ulasan motor beserta ringkasan (averageRating, totalReviews, ratingDistribution).
   */
  async getMotorReviews(motorId, paging = {}, sort = 'newest') {
    const numericMotorId = Number(motorId);
    const motor = await motorRepo.findById(numericMotorId);
    if (!motor) {
      throw new AppError('Motor tidak ditemukan.', 'NOT_FOUND', 404);
    }

    let reviews = [];
    if (process.env.USE_DB === 'postgres') {
      const rRes = await reviewRepo.findByMotorId(numericMotorId, { limit: 1000 });
      reviews = rRes.items;
    } else {
      reviews = store.getCollection('reviews').filter((r) => Number(r.motorId) === numericMotorId).map((r) => ({ ...r }));
    }

    // Hitung rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)));
      ratingDistribution[star] = (ratingDistribution[star] || 0) + 1;
      sum += Number(r.rating) || 5;
    });

    const total = reviews.length;
    const averageRating = total > 0 ? Math.round((sum / total) * 10) / 10 : 5.0;

    // Sorting
    if (sort === 'highest') {
      reviews.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'lowest') {
      reviews.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    } else {
      reviews.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    const page = Math.max(1, parseInt(paging.page, 10) || 1);
    const limit = Math.max(1, parseInt(paging.limit, 10) || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const items = reviews.slice(offset, offset + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      summary: {
        averageRating,
        totalReviews: total,
        ratingDistribution,
      },
    };
  }

  /**
   * Tambah ulasan baru (Atomic Transaction):
   * 1. Kunci baris motor FOR UPDATE (sesuai urutan deadlock).
   * 2. INSERT ... SELECT memastikan booking milik user, status completed, dan belum ada ulasan.
   * 3. Perbarui rating_avg, rating_count, dan distribusi rating 1..5 dalam transaksi yang sama.
   */
  async addReview({ bookingId, rating, comment }, user) {
    const cleanComment = (comment || '')
      .replace(/<[^>]*>?/gm, '')
      .trim()
      .slice(0, 500);

    const numericRating = Math.min(5, Math.max(1, parseInt(rating, 10)));

    return await transaction(async (tx) => {
      const booking = await tx.bookingRepo.findById(bookingId);
      if (!booking) {
        throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
      }

      if (Number(booking.userId) !== Number(user.id)) {
        throw new AppError('Anda hanya dapat mengulas pemesanan milik Anda sendiri.', 'FORBIDDEN', 403);
      }

      if (booking.status !== BOOKING_STATUS.COMPLETED) {
        throw new AppError('Ulasan hanya dapat diberikan untuk sewa yang telah selesai.', 'VALIDATION_ERROR', 400);
      }

      // 1. Kunci baris motor FOR UPDATE
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query('SELECT id FROM motorcycles WHERE id = $1 FOR UPDATE', [booking.motorId]);
      }

      // 2. Cek apakah booking sudah pernah diulas
      const existing = await tx.reviewRepo.findByBookingId(booking.id);
      if (existing) {
        throw new AppError('Pemesanan ini sudah pernah Anda beri ulasan.', 'VALIDATION_ERROR', 400);
      }

      let newReview = null;
      if (tx.driver === 'postgres' && tx.client) {
        // Atomic INSERT ... SELECT
        const insertRes = await tx.client.query(
          `INSERT INTO reviews (booking_id, user_id, motorcycle_id, rating, comment, created_at)
           SELECT b.id, b.user_id, b.motorcycle_id, $1, $2, now()
           FROM bookings b
           WHERE b.id = $3
             AND b.user_id = $4
             AND b.status = 'completed'
             AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id)
           RETURNING *`,
          [numericRating, cleanComment, booking.id, user.id],
        );

        if (insertRes.rows.length === 0) {
          throw new AppError('Pemesanan ini sudah pernah Anda beri ulasan atau tidak valid.', 'VALIDATION_ERROR', 400);
        }

        newReview = await tx.reviewRepo.findById(insertRes.rows[0].id);
      } else {
        newReview = await tx.reviewRepo.create({
          bookingId: Number(booking.id),
          motorId: Number(booking.motorId),
          userId: Number(user.id),
          userName: user.name,
          userAvatar: user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`,
          rating: numericRating,
          comment: cleanComment,
        });
      }

      // 3. Perbarui rating_avg, rating_count, dan distribusi rating 1..5 pada motor
      await recalcRatings(booking.motorId, tx);

      return newReview;
    });
  }

  async recalcRatings(motorId) {
    return recalcRatings(motorId);
  }
}

const service = new ReviewService();
service.recalcRatings = recalcRatings;

module.exports = service;

