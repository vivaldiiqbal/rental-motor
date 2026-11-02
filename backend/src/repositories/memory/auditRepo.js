const store = require('../store');

/**
 * Kontrak Audit Repository:
 * - findAll(filter, paging): Promise<{ items: AuditLog[], total: number }>
 * - create(data): Promise<AuditLog>
 */
const auditRepo = {
  async findAll(filter = {}, paging = {}) {
    let list = store.getCollection('auditLogs').map((a) => ({ ...a }));

    if (filter.action && filter.action !== 'all') {
      list = list.filter((a) => a.action && a.action.includes(filter.action));
    }
    if (filter.actorId) {
      list = list.filter((a) => String(a.actorId) === String(filter.actorId));
    }
    if (filter.actorRole && filter.actorRole !== 'all') {
      list = list.filter((a) => a.actorRole === filter.actorRole);
    }
    if (filter.entityType && filter.entityType !== 'all') {
      list = list.filter((a) => a.entityType === filter.entityType);
    }
    if (filter.entityId) {
      list = list.filter((a) => String(a.entityId) === String(filter.entityId));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.action && a.action.toLowerCase().includes(q)) ||
          (a.details && a.details.toLowerCase().includes(q)) ||
          (a.actorName && a.actorName.toLowerCase().includes(q)),
      );
    }
    if (filter.date) {
      list = list.filter((a) => a.at && a.at.startsWith(filter.date));
    }

    // Default sorting waktu audit terbaru
    list.sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 15;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async create(payload) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.auditLogs)) {
        data.auditLogs = [];
      }
      const nextId =
        data.auditLogs.length > 0
          ? Math.max(...data.auditLogs.map((a) => Number(a.id) || 0)) + 1
          : 1;

      const record = {
        id: nextId,
        at: new Date().toISOString(),
        ...payload,
      };

      data.auditLogs.unshift(record);
      return { ...record };
    });
  },

  async record(payload) {
    return this.create(payload);
  },
};

module.exports = auditRepo;
