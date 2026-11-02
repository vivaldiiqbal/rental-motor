const store = require('../store');

/**
 * Kontrak Favorite Repository:
 * - findByUserId(userId): Promise<Favorite[]>
 * - isFavorite(userId, motorId): Promise<boolean>
 * - add(userId, motorId): Promise<Favorite>
 * - remove(userId, motorId): Promise<boolean>
 * - sync(userId, motorIds): Promise<number[]>
 */
const favoriteRepo = {
  async findByUserId(userId) {
    const numericUserId = Number(userId);
    return store.getCollection('favorites')
      .filter((f) => Number(f.userId) === numericUserId)
      .map((f) => ({ ...f }));
  },

  async isFavorite(userId, motorId) {
    const numericUserId = Number(userId);
    const numericMotorId = Number(motorId);
    return store.getCollection('favorites').some(
      (f) => Number(f.userId) === numericUserId && Number(f.motorId) === numericMotorId,
    );
  },

  async add(userId, motorId) {
    return store.withLock(async (data) => {
      const numericUserId = Number(userId);
      const numericMotorId = Number(motorId);

      const exists = data.favorites.find(
        (f) => Number(f.userId) === numericUserId && Number(f.motorId) === numericMotorId,
      );
      if (exists) return { ...exists };

      const nextId = data.favorites.length > 0 ? Math.max(...data.favorites.map((f) => Number(f.id) || 0)) + 1 : 1;
      const newFav = {
        id: nextId,
        userId: numericUserId,
        motorId: numericMotorId,
        createdAt: new Date().toISOString(),
      };
      data.favorites.push(newFav);
      return { ...newFav };
    });
  },

  async remove(userId, motorId) {
    return store.withLock(async (data) => {
      const numericUserId = Number(userId);
      const numericMotorId = Number(motorId);
      const initialLength = data.favorites.length;
      data.favorites = data.favorites.filter(
        (f) => !(Number(f.userId) === numericUserId && Number(f.motorId) === numericMotorId),
      );
      return data.favorites.length < initialLength;
    });
  },

  async sync(userId, motorIds = []) {
    return store.withLock(async (data) => {
      const numericUserId = Number(userId);
      const currentMotorIds = new Set(
        data.favorites
          .filter((f) => Number(f.userId) === numericUserId)
          .map((f) => Number(f.motorId)),
      );

      for (const id of motorIds) {
        const num = Number(id);
        if (!isNaN(num) && !currentMotorIds.has(num)) {
          const nextId = data.favorites.length > 0 ? Math.max(...data.favorites.map((f) => Number(f.id) || 0)) + 1 : 1;
          data.favorites.push({
            id: nextId,
            userId: numericUserId,
            motorId: num,
            createdAt: new Date().toISOString(),
          });
          currentMotorIds.add(num);
        }
      }

      return Array.from(currentMotorIds);
    });
  },
};

module.exports = favoriteRepo;
