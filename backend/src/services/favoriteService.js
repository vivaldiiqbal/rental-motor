const { favoriteRepo, motorRepo } = require('../repositories');
const { sanitizeMotor } = require('../utils/sanitize');
const AppError = require('../utils/AppError');

class FavoriteService {
  async getUserFavorites(userId) {
    const favs = await favoriteRepo.findByUserId(userId);
    const motorIds = favs.map((f) => f.motorId);

    const motors = await Promise.all(
      motorIds.map(async (id) => {
        const m = await motorRepo.findById(id);
        return m ? sanitizeMotor(m) : null;
      }),
    );

    return motors.filter(Boolean);
  }

  /**
   * Tambah ke favorit secara idempotent.
   */
  async addFavorite(userId, motorId) {
    const motor = await motorRepo.findById(motorId);
    if (!motor) {
      throw new AppError('Motor tidak ditemukan.', 'NOT_FOUND', 404);
    }
    await favoriteRepo.add(userId, motorId);
    return { favorited: true, motorId: Number(motorId) };
  }

  /**
   * Hapus dari favorit secara idempotent.
   */
  async removeFavorite(userId, motorId) {
    await favoriteRepo.remove(userId, motorId);
    return { favorited: false, motorId: Number(motorId) };
  }

  /**
   * Sinkronisasi daftar favorit dari local storage tamu saat login.
   */
  async syncFavorites(userId, motorIds = []) {
    const finalIds = await favoriteRepo.sync(userId, motorIds);
    return {
      syncedCount: finalIds.length,
      motorIds: finalIds,
    };
  }
}

module.exports = new FavoriteService();
