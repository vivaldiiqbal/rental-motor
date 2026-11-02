const store = require('../store');

/**
 * Kontrak Motor Repository:
 * - findById(id): Promise<Motor | null>
 * - findBySlug(slug): Promise<Motor | null>
 * - findAll(filter, paging): Promise<{ items: Motor[], total: number }>
 * - search(filter, paging, sort): Promise<{ items: Motor[], total: number }>
 * - findSimilar(motorId, limit): Promise<Motor[]>
 * - findFeatured(limit): Promise<Motor[]>
 * - getDistinctBrands(): Promise<string[]>
 * - getPriceRange(): Promise<{ min: number, max: number }>
 * - create(data): Promise<Motor>
 * - update(id, data): Promise<Motor | null>
 * - delete(id): Promise<boolean>
 */
const motorRepo = {
  async findById(id) {
    const motors = store.getCollection('motors');
    const numericId = Number(id);
    const motor = motors.find((m) => m.id === numericId || String(m.id) === String(id));
    return motor ? { ...motor } : null;
  },

  async findBySlug(slug, excludeId = null) {
    if (!slug) return null;
    const motors = store.getCollection('motors');
    const motor = motors.find(
      (m) =>
        m.slug === slug &&
        (excludeId === null || (m.id !== Number(excludeId) && String(m.id) !== String(excludeId))),
    );
    return motor ? { ...motor } : null;
  },

  async findByPlate(plate, excludeId = null) {
    if (!plate) return null;
    const normalized = plate.replace(/\s+/g, '').toLowerCase();
    const motors = store.getCollection('motors');
    const motor = motors.find(
      (m) =>
        m.plate &&
        m.plate.replace(/\s+/g, '').toLowerCase() === normalized &&
        (excludeId === null || (m.id !== Number(excludeId) && String(m.id) !== String(excludeId))),
    );
    return motor ? { ...motor } : null;
  },

  async findAll(filter = {}, paging = {}) {
    let list = store.getCollection('motors').map((m) => ({ ...m }));

    if (filter.status) {
      const target = filter.status === 'active' ? 'available' : filter.status;
      list = list.filter((m) => m.status === target || m.status === filter.status);
    }
    if (filter.type) {
      list = list.filter((m) => m.type === filter.type);
    }
    if (filter.brand) {
      list = list.filter((m) => m.brand === filter.brand);
    }
    if (filter.search) {
      const q = String(filter.search).toLowerCase().trim();
      list = list.filter(
        (m) =>
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.brand && m.brand.toLowerCase().includes(q)) ||
          (m.plate && m.plate.toLowerCase().includes(q)) ||
          (m.plateNumber && m.plateNumber.toLowerCase().includes(q)) ||
          (m.type && m.type.toLowerCase().includes(q))
      );
    }
    if (filter.ids && Array.isArray(filter.ids) && filter.ids.length > 0) {
      const idSet = new Set(filter.ids.map(String));
      list = list.filter((m) => idSet.has(String(m.id)));
    }

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 50;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async search(filter = {}, paging = {}, sort = 'popular') {
    let list = store.getCollection('motors').map((m) => ({ ...m }));

    // Pencarian teks nama, merek, tipe
    if (filter.q) {
      const q = filter.q.trim().toLowerCase();
      list = list.filter((m) => `${m.name} ${m.brand} ${m.type}`.toLowerCase().includes(q));
    }

    // Filter multi-tipe
    if (filter.types && Array.isArray(filter.types) && filter.types.length > 0) {
      list = list.filter((m) => filter.types.includes(m.type));
    }

    // Filter multi-merek
    if (filter.brands && Array.isArray(filter.brands) && filter.brands.length > 0) {
      list = list.filter((m) => filter.brands.includes(m.brand));
    }

    // Transmisi
    if (filter.transmission) {
      list = list.filter((m) => m.transmission.toLowerCase() === filter.transmission.toLowerCase());
    }

    // Rentang harga
    if (typeof filter.minPrice === 'number') {
      list = list.filter((m) => m.pricePerDay >= filter.minPrice);
    }
    if (typeof filter.maxPrice === 'number' && filter.maxPrice > 0) {
      list = list.filter((m) => m.pricePerDay <= filter.maxPrice);
    }

    // Rating minimal
    if (typeof filter.minRating === 'number' && filter.minRating > 0) {
      list = list.filter((m) => m.rating >= filter.minRating);
    }

    // Status aktif saja
    if (filter.onlyAvailable) {
      list = list.filter((m) => m.status === 'available');
    }

    // Sorting
    const sorters = {
      'price-asc': (a, b) => a.pricePerDay - b.pricePerDay,
      'price-desc': (a, b) => b.pricePerDay - a.pricePerDay,
      rating: (a, b) => b.rating - a.rating,
      newest: (a, b) => b.year - a.year,
      popular: (a, b) => (b.popularity || 0) - (a.popularity || 0),
    };
    list.sort(sorters[sort] || sorters.popular);

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 12;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async findSimilar(motorId, limit = 3) {
    const numericId = Number(motorId);
    const current = await this.findById(numericId);
    if (!current) return [];

    const motors = store.getCollection('motors').map((m) => ({ ...m }));
    return motors
      .filter((m) => m.id !== numericId && (m.type === current.type || m.brand === current.brand) && m.status === 'available')
      .slice(0, limit);
  },

  async findFeatured(limit = 4) {
    const motors = store.getCollection('motors').map((m) => ({ ...m }));
    return motors
      .filter((m) => m.status === 'available')
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, limit);
  },

  async getDistinctBrands() {
    const motors = store.getCollection('motors');
    return [...new Set(motors.map((m) => m.brand))].sort();
  },

  async getAdminFilterOptions() {
    const motors = store.getCollection('motors');
    const brands = [...new Set(motors.map((m) => m.brand).filter(Boolean))].sort();
    const types = [...new Set(motors.map((m) => m.type).filter(Boolean))].sort();
    return { brands, types };
  },

  async getPriceRange() {
    const motors = store.getCollection('motors');
    if (motors.length === 0) return { min: 0, max: 0 };
    const prices = motors.map((m) => m.pricePerDay);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  },

  async create(motorData) {
    return store.withLock(async (data) => {
      const nextId = data.motors.length > 0 ? Math.max(...data.motors.map((m) => Number(m.id) || 0)) + 1 : 1;
      const newMotor = {
        id: nextId,
        rating: 5.0,
        reviewCount: 0,
        popularity: 50,
        status: 'available',
        ...motorData,
      };
      data.motors.push(newMotor);
      return { ...newMotor };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const index = data.motors.findIndex((m) => m.id === numericId || String(m.id) === String(id));
      if (index === -1) return null;

      const current = data.motors[index];
      const updated = {
        ...current,
        ...patch,
      };
      updated.id = current.id;
      data.motors[index] = updated;
      return { ...updated };
    });
  },

  async delete(id) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const initialLength = data.motors.length;
      data.motors = data.motors.filter((m) => m.id !== numericId && String(m.id) !== String(id));
      return data.motors.length < initialLength;
    });
  },
};

module.exports = motorRepo;
