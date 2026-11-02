const store = require('../store');

/**
 * Kontrak Promo Repository:
 * - findByCode(code): Promise<Promo | null>
 * - findAll(onlyActive): Promise<Promo[]>
 * - decrementQuota(code): Promise<boolean>
 * - incrementQuota(code): Promise<boolean>
 */
const promoRepo = {
  async findByCode(code) {
    if (!code) return null;
    const promos = store.getCollection('promos');
    const promo = promos.find((p) => p.code.toUpperCase() === code.trim().toUpperCase());
    if (!promo) return null;
    return {
      isActive: promo.isActive !== false,
      ...promo,
    };
  },

  async findAll(onlyActive = true) {
    let list = store.getCollection('promos').map((p) => ({
      isActive: p.isActive !== false,
      ...p,
    }));
    if (onlyActive) {
      const today = new Date().toISOString().slice(0, 10);
      list = list.filter((p) => p.isActive && p.validUntil >= today && p.quota > 0);
    }
    return list;
  },

  async decrementQuota(code) {
    return store.withLock(async (data) => {
      const promo = data.promos.find((p) => p.code.toUpperCase() === code.trim().toUpperCase());
      if (promo && promo.quota > 0) {
        promo.quota -= 1;
        return true;
      }
      return false;
    });
  },

  async incrementQuota(code) {
    return store.withLock(async (data) => {
      const promo = data.promos.find((p) => p.code.toUpperCase() === code.trim().toUpperCase());
      if (promo) {
        promo.quota += 1;
        return true;
      }
      return false;
    });
  },

  async findById(id) {
    const promos = store.getCollection('promos');
    const numericId = Number(id);
    const promo = promos.find((p) => p.id === numericId || String(p.id) === String(id));
    if (!promo) return null;
    return {
      isActive: promo.isActive !== false,
      ...promo,
    };
  },

  async hasUsage(codeOrId) {
    const promo = await this.findByCode(codeOrId) || await this.findById(codeOrId);
    if (!promo) return false;
    const bookings = store.getCollection('bookings');
    return bookings.some(
      (b) =>
        (b.promoCode && b.promoCode.toUpperCase() === promo.code.toUpperCase()) ||
        b.promoId === promo.id,
    );
  },

  async create(promoData) {
    return store.withLock(async (data) => {
      const nextId =
        data.promos.length > 0 ? Math.max(...data.promos.map((p) => Number(p.id) || 0)) + 1 : 1;
      const newPromo = {
        id: nextId,
        isActive: promoData.isActive !== false,
        usedCount: 0,
        createdAt: new Date().toISOString(),
        ...promoData,
        code: promoData.code.trim().toUpperCase(),
      };
      data.promos.push(newPromo);
      return { ...newPromo };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const index = data.promos.findIndex((p) => p.id === numericId || String(p.id) === String(id));
      if (index === -1) return null;

      const current = data.promos[index];
      const updated = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      if (patch.code) {
        updated.code = patch.code.trim().toUpperCase();
      }
      updated.id = current.id;
      data.promos[index] = updated;
      return { ...updated };
    });
  },

  async toggleActive(id) {
    const item = await this.findById(id);
    if (!item) return null;
    return this.update(id, { isActive: !item.isActive });
  },

  async delete(id) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const initial = data.promos.length;
      data.promos = data.promos.filter((p) => p.id !== numericId && String(p.id) !== String(id));
      return data.promos.length < initial;
    });
  },
};

module.exports = promoRepo;
