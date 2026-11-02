const store = require('../store');

/**
 * Kontrak User Repository:
 * - findById(id): Promise<User | null>
 * - findByEmail(email): Promise<User | null>
 * - findAll(filter, paging): Promise<{ items: User[], total: number }>
 * - create(data): Promise<User>
 * - update(id, data): Promise<User | null>
 * - delete(id): Promise<boolean>
 */
const userRepo = {
  async findById(id) {
    const users = store.getCollection('users');
    const numericId = Number(id);
    const user = users.find((u) => u.id === numericId || String(u.id) === String(id));
    return user ? { ...user } : null;
  },

  async findByEmail(email) {
    if (!email) return null;
    const users = store.getCollection('users');
    const normalized = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === normalized);
    return user ? { ...user } : null;
  },

  async countActiveAdmins(excludeId = null) {
    const users = store.getCollection('users');
    return users.filter((u) => {
      if (excludeId && (u.id === Number(excludeId) || String(u.id) === String(excludeId))) {
        return false;
      }
      const isActive = u.isActive !== false && u.is_active !== false;
      return u.role === 'admin' && isActive;
    }).length;
  },

  async findAll(filter = {}, paging = {}) {
    let list = store.getCollection('users').map((u) => ({ ...u }));

    if (filter.role && filter.role !== 'all') {
      list = list.filter((u) => u.role === filter.role);
    }
    if (filter.isActive !== undefined) {
      list = list.filter((u) => {
        const active = u.isActive !== false && u.is_active !== false;
        return active === Boolean(filter.isActive);
      });
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone && u.phone.includes(q)),
      );
    }

    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 10;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async create(userData) {
    return store.withLock(async (data) => {
      const nextId = data.users.length > 0 ? Math.max(...data.users.map((u) => Number(u.id) || 0)) + 1 : 1;
      const newUser = {
        id: nextId,
        role: 'customer',
        documents: { ktp: 'not_uploaded', sim: 'not_uploaded' },
        preferences: { emailNotif: true, whatsappNotif: true, promo: false },
        createdAt: new Date().toISOString(),
        ...userData,
      };
      data.users.push(newUser);
      return { ...newUser };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const index = data.users.findIndex((u) => u.id === numericId || String(u.id) === String(id));
      if (index === -1) return null;

      const current = data.users[index];
      const updated = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      // Jangan biarkan id berubah
      updated.id = current.id;

      data.users[index] = updated;
      return { ...updated };
    });
  },

  async delete(id) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const initialLength = data.users.length;
      data.users = data.users.filter((u) => u.id !== numericId && String(u.id) !== String(id));
      return data.users.length < initialLength;
    });
  },
};

module.exports = userRepo;
