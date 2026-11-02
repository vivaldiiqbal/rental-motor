const store = require('../store');
const { isOverlapping } = require('../../utils/dates');

/**
 * Kontrak Maintenance Repository:
 * - findAll(filter, paging): Promise<{ items: ServiceBlock[], total: number }>
 * - findById(id): Promise<ServiceBlock | null>
 * - findOverlapping(motorId, start, end, excludeId): Promise<ServiceBlock[]>
 * - create(data): Promise<ServiceBlock>
 * - update(id, data): Promise<ServiceBlock | null>
 * - delete(id): Promise<boolean>
 */
function computeStatus(s) {
  if (s.completedAt || s.status === 'completed') return 'completed';
  const clock = require('../../utils/clock');
  const { toISODate } = require('../../utils/dates');
  const todayWIB = toISODate(clock.now());
  const start = toISODate(s.startDate);
  const end = toISODate(s.endDate);

  if (todayWIB < start) return 'scheduled';
  if (todayWIB >= start && todayWIB <= end) return 'in_progress';
  return 'completed';
}

const maintenanceRepo = {
  async findAll(filter = {}, paging = {}) {
    let list = store.getCollection('serviceBlocks').map((s) => ({
      ...s,
      status: computeStatus(s),
    }));

    if (filter.motorId) {
      list = list.filter((s) => Number(s.motorId) === Number(filter.motorId));
    }
    if (filter.status && filter.status !== 'all') {
      list = list.filter((s) => s.status === filter.status);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (s) =>
          (s.motorName && s.motorName.toLowerCase().includes(q)) ||
          (s.reason && s.reason.toLowerCase().includes(q)) ||
          (s.technician && s.technician.toLowerCase().includes(q)),
      );
    }

    list.sort((a, b) => b.startDate.localeCompare(a.startDate));

    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 10;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total };
  },

  async findById(id) {
    const list = store.getCollection('serviceBlocks');
    const numericId = Number(id);
    const item = list.find((s) => s.id === numericId || String(s.id) === String(id));
    return item ? { ...item, status: computeStatus(item) } : null;
  },

  async findOverlapping(motorId, start, end, excludeId = null) {
    const list = store.getCollection('serviceBlocks');
    const numericMotorId = Number(motorId);
    const numericExcludeId = excludeId !== null ? Number(excludeId) : null;

    return list.filter((s) => {
      if (Number(s.motorId) !== numericMotorId) return false;
      if (numericExcludeId && (s.id === numericExcludeId || String(s.id) === String(excludeId))) return false;
      if (s.status === 'completed') return false;
      return isOverlapping(start, end, s.startDate, s.endDate);
    });
  },

  async create(payload) {
    return store.withLock(async (data) => {
      if (!Array.isArray(data.serviceBlocks)) {
        data.serviceBlocks = [];
      }
      const nextId =
        data.serviceBlocks.length > 0
          ? Math.max(...data.serviceBlocks.map((s) => Number(s.id) || 0)) + 1
          : 1;

      const record = {
        id: nextId,
        status: payload.status || 'scheduled',
        createdAt: new Date().toISOString(),
        ...payload,
      };

      data.serviceBlocks.unshift(record);
      return { ...record };
    });
  },

  async update(id, patch) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const index = data.serviceBlocks.findIndex(
        (s) => s.id === numericId || String(s.id) === String(id),
      );
      if (index === -1) return null;

      const current = data.serviceBlocks[index];
      const updated = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      updated.id = current.id;
      data.serviceBlocks[index] = updated;
      return { ...updated };
    });
  },

  async delete(id) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const initial = data.serviceBlocks.length;
      data.serviceBlocks = data.serviceBlocks.filter(
        (s) => s.id !== numericId && String(s.id) !== String(id),
      );
      return data.serviceBlocks.length < initial;
    });
  },
};

module.exports = maintenanceRepo;
