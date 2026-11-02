const store = require('../store');

const inMemoryIdempotency = new Map();

const idempotencyRepo = {
  async findByKey(key, userId = null) {
    if (!key) return null;
    const item = inMemoryIdempotency.get(key.trim());
    if (!item) return null;
    if (userId !== null && userId !== undefined && Number(item.userId) !== Number(userId)) {
      return null;
    }
    return { ...item };
  },

  async create(data) {
    const record = {
      id: Date.now(),
      key: data.key.trim(),
      userId: data.userId ? Number(data.userId) : null,
      requestHash: data.requestHash || '',
      resourceId: data.resourceId ? Number(data.resourceId) : null,
      responseBody: data.responseBody || {},
      statusCode: data.statusCode || 200,
      createdAt: new Date().toISOString(),
    };
    inMemoryIdempotency.set(data.key.trim(), record);
    return { ...record };
  },

  async delete(key) {
    return inMemoryIdempotency.delete(key.trim());
  },
};

module.exports = idempotencyRepo;
