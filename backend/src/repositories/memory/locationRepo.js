const store = require('../store');
const { RENTAL_RULES } = require('../../config/rules');

function getDefaultLocations() {
  const defaultLocNames = RENTAL_RULES.pickupLocations || [
    'Kantor Pusat RodaKita (Gratis)',
    'Bandara Internasional (Layanan Antar/Jemput)',
    'Stasiun Kereta Api (Layanan Antar/Jemput)',
    'Hotel / Villa Area (Layanan Antar/Jemput)',
  ];

  return defaultLocNames.map((name, idx) => ({
    id: `loc-${idx + 1}`,
    name,
    fee: name.includes('Gratis') ? 0 : (RENTAL_RULES.deliveryFeePerTrip || 25000),
    isDelivery: !name.includes('Gratis'),
    isActive: true,
  }));
}

/**
 * Kontrak Location Repository:
 * - findAll(filter): Promise<Location[]>
 * - findById(id): Promise<Location | null>
 * - create(data): Promise<Location>
 * - update(id, data): Promise<Location | null>
 * - toggleActive(id): Promise<Location | null>
 * - hasUsage(id): Promise<boolean>
 * - delete(id): Promise<boolean>
 */
const locationRepo = {
  async findAll(filter = {}) {
    if (!store.isLoaded) store.init();
    if (!Array.isArray(store.data.locations) || store.data.locations.length === 0) {
      store.data.locations = getDefaultLocations();
    }

    let list = store.getCollection('locations').map((l) => ({ ...l }));
    if (filter.isActive !== undefined) {
      list = list.filter((l) => Boolean(l.isActive) === Boolean(filter.isActive));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((l) => l.name.toLowerCase().includes(q));
    }
    return list;
  },

  async findById(id) {
    const list = await this.findAll();
    const item = list.find((l) => l.id === id || String(l.id) === String(id));
    return item ? { ...item } : null;
  },

  async hasUsage(id) {
    const loc = await this.findById(id);
    if (!loc) return false;
    const bookings = store.getCollection('bookings');
    return bookings.some((b) => {
      const pAddr = b.pickupAddress || '';
      const rAddr = b.returnAddress || '';
      return pAddr.includes(loc.name) || rAddr.includes(loc.name) || b.pickupLocationId === id;
    });
  },

  async create(payload) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.locations) || data.locations.length === 0) {
        data.locations = getDefaultLocations();
      }
      const newId = payload.id || `loc-${Date.now()}`;
      const newRecord = {
        id: newId,
        name: payload.name,
        fee: Number(payload.fee) || 0,
        isDelivery: payload.isDelivery !== undefined ? Boolean(payload.isDelivery) : Number(payload.fee) > 0,
        isActive: payload.isActive !== false,
        createdAt: new Date().toISOString(),
      };
      data.locations.push(newRecord);
      return { ...newRecord };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.locations) || data.locations.length === 0) {
        data.locations = getDefaultLocations();
      }
      const idx = data.locations.findIndex((l) => l.id === id || String(l.id) === String(id));
      if (idx === -1) return null;

      const current = data.locations[idx];
      const updated = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      updated.id = current.id;
      data.locations[idx] = updated;
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
      if (!Array.isArray(data.locations)) return false;
      const initial = data.locations.length;
      data.locations = data.locations.filter((l) => l.id !== id && String(l.id) !== String(id));
      return data.locations.length < initial;
    });
  },
};

module.exports = locationRepo;
