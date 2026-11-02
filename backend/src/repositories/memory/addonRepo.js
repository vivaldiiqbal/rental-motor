const store = require('../store');
const { RENTAL_RULES } = require('../../config/rules');

function getDefaultAddons() {
  return (RENTAL_RULES.addOns || []).map((a, idx) => ({
    id: a.id || `addon-${idx + 1}`,
    name: a.name,
    price: a.pricePerDay || a.price || 10000,
    pricePerDay: a.pricePerDay || a.price || 10000,
    description: a.description || '',
    isActive: true,
  }));
}

/**
 * Kontrak Addon Repository:
 * - findAll(filter): Promise<Addon[]>
 * - findById(id): Promise<Addon | null>
 * - create(data): Promise<Addon>
 * - update(id, data): Promise<Addon | null>
 * - toggleActive(id): Promise<Addon | null>
 * - hasUsage(id): Promise<boolean>
 * - delete(id): Promise<boolean>
 */
const addonRepo = {
  async findAll(filter = {}) {
    if (!store.isLoaded) store.init();
    if (!Array.isArray(store.data.addons) || store.data.addons.length === 0) {
      store.data.addons = getDefaultAddons();
    }

    let list = store.getCollection('addons').map((a) => ({ ...a }));
    if (filter.isActive !== undefined) {
      list = list.filter((a) => Boolean(a.isActive) === Boolean(filter.isActive));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    return list;
  },

  async findById(id) {
    const list = await this.findAll();
    const item = list.find((a) => a.id === id || String(a.id) === String(id));
    return item ? { ...item } : null;
  },

  async hasUsage(id) {
    const bookings = store.getCollection('bookings');
    return bookings.some((b) => {
      if (Array.isArray(b.addonsList)) {
        return b.addonsList.some((a) => a.id === id || String(a.id) === String(id));
      }
      if (Array.isArray(b.addons)) {
        return b.addons.some((a) => a.id === id || String(a.id) === String(id) || a === id);
      }
      return false;
    });
  },

  async create(payload) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.addons) || data.addons.length === 0) {
        data.addons = getDefaultAddons();
      }
      const newId = payload.id || `addon-${Date.now()}`;
      const newRecord = {
        id: newId,
        name: payload.name,
        price: Number(payload.price || payload.pricePerDay) || 10000,
        pricePerDay: Number(payload.price || payload.pricePerDay) || 10000,
        description: payload.description || '',
        isActive: payload.isActive !== false,
        createdAt: new Date().toISOString(),
      };
      data.addons.push(newRecord);
      return { ...newRecord };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.addons) || data.addons.length === 0) {
        data.addons = getDefaultAddons();
      }
      const idx = data.addons.findIndex((a) => a.id === id || String(a.id) === String(id));
      if (idx === -1) return null;

      const current = data.addons[idx];
      const updated = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      updated.id = current.id;
      data.addons[idx] = updated;
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
      if (!Array.isArray(data.addons)) return false;
      const initial = data.addons.length;
      data.addons = data.addons.filter((a) => a.id !== id && String(a.id) !== String(id));
      return data.addons.length < initial;
    });
  },
};

module.exports = addonRepo;
