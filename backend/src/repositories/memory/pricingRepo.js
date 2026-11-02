const store = require('../store');
const { DEFAULT_DISCOUNT_TIERS, DEFAULT_PRICING_RULES } = require('../../config/pricingDefaults');

const pricingRepo = {
  // ================= PRICING RULES =================
  async findActiveRules() {
    store.init();
    const rules = store.data.pricingRules || [];
    if (rules.length === 0) {
      return [...DEFAULT_PRICING_RULES];
    }
    return rules
      .filter((r) => r.isActive !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.id - b.id);
  },

  async findAllRules(filter = {}) {
    store.init();
    let rules = store.data.pricingRules || [];
    if (rules.length === 0) {
      rules = [...DEFAULT_PRICING_RULES];
    }

    if (filter.isActive !== undefined) {
      rules = rules.filter((r) => r.isActive === Boolean(filter.isActive));
    }
    if (filter.ruleType) {
      rules = rules.filter((r) => r.ruleType === filter.ruleType);
    }

    return rules.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.id - b.id);
  },

  async findRuleById(id) {
    store.init();
    const rules = store.data.pricingRules || [];
    const found = rules.find((r) => Number(r.id) === Number(id));
    if (!found && rules.length === 0) {
      return DEFAULT_PRICING_RULES.find((r) => Number(r.id) === Number(id)) || null;
    }
    return found || null;
  },

  async createRule(data) {
    store.init();
    return await store.mutex.runExclusive(async () => {
      if (!store.data.pricingRules) store.data.pricingRules = [];

      const nextId = store.data.pricingRules.length > 0
        ? Math.max(...store.data.pricingRules.map((r) => Number(r.id) || 0)) + 1
        : 1;

      const newRule = {
        id: nextId,
        name: data.name.trim(),
        ruleType: data.ruleType,
        rateType: data.rateType,
        rateValue: Number(data.rateValue),
        scope: data.scope || 'all',
        targetMotorType: data.targetMotorType || null,
        targetMotorcycleId: data.targetMotorcycleId ? Number(data.targetMotorcycleId) : null,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        priority: data.priority !== undefined ? Number(data.priority) : 10,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        description: data.description || '',
        updatedBy: data.updatedBy ? Number(data.updatedBy) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.data.pricingRules.push(newRule);
      store.schedulePersist();
      return { ...newRule };
    });
  },

  async updateRule(id, patch) {
    store.init();
    return await store.mutex.runExclusive(async () => {
      if (!store.data.pricingRules) store.data.pricingRules = [];
      const index = store.data.pricingRules.findIndex((r) => Number(r.id) === Number(id));
      if (index === -1) return null;

      const existing = store.data.pricingRules[index];
      const updated = {
        ...existing,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        ruleType: patch.ruleType !== undefined ? patch.ruleType : existing.ruleType,
        rateType: patch.rateType !== undefined ? patch.rateType : existing.rateType,
        rateValue: patch.rateValue !== undefined ? Number(patch.rateValue) : existing.rateValue,
        scope: patch.scope !== undefined ? patch.scope : existing.scope,
        targetMotorType: patch.targetMotorType !== undefined ? patch.targetMotorType : existing.targetMotorType,
        targetMotorcycleId: patch.targetMotorcycleId !== undefined ? (patch.targetMotorcycleId ? Number(patch.targetMotorcycleId) : null) : existing.targetMotorcycleId,
        startDate: patch.startDate !== undefined ? patch.startDate : existing.startDate,
        endDate: patch.endDate !== undefined ? patch.endDate : existing.endDate,
        priority: patch.priority !== undefined ? Number(patch.priority) : existing.priority,
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : existing.isActive,
        description: patch.description !== undefined ? patch.description : existing.description,
        updatedBy: patch.updatedBy !== undefined ? Number(patch.updatedBy) : existing.updatedBy,
        updatedAt: new Date().toISOString(),
      };

      store.data.pricingRules[index] = updated;
      store.schedulePersist();
      return { ...updated };
    });
  },

  async deleteRule(id) {
    store.init();
    return await store.mutex.runExclusive(async () => {
      if (!store.data.pricingRules) return false;
      const initialLen = store.data.pricingRules.length;
      store.data.pricingRules = store.data.pricingRules.filter((r) => Number(r.id) !== Number(id));
      const deleted = store.data.pricingRules.length < initialLen;
      if (deleted) store.schedulePersist();
      return deleted;
    });
  },

  // ================= DISCOUNT TIERS =================
  async findActiveTiers() {
    store.init();
    const tiers = store.data.discountTiers || [];
    if (tiers.length === 0) {
      return [...DEFAULT_DISCOUNT_TIERS];
    }
    return tiers
      .filter((t) => t.isActive !== false)
      .sort((a, b) => a.minDays - b.minDays);
  },

  async findAllTiers() {
    store.init();
    const tiers = store.data.discountTiers || [];
    if (tiers.length === 0) {
      return [...DEFAULT_DISCOUNT_TIERS];
    }
    return tiers.slice().sort((a, b) => a.minDays - b.minDays);
  },

  async findTierById(id) {
    store.init();
    const tiers = store.data.discountTiers || [];
    const found = tiers.find((t) => Number(t.id) === Number(id));
    if (!found && tiers.length === 0) {
      return DEFAULT_DISCOUNT_TIERS.find((t) => Number(t.id) === Number(id)) || null;
    }
    return found || null;
  },

  async createTier(data) {
    store.init();
    return await store.mutex.runExclusive(async () => {
      if (!store.data.discountTiers) store.data.discountTiers = [];

      const nextId = store.data.discountTiers.length > 0
        ? Math.max(...store.data.discountTiers.map((t) => Number(t.id) || 0)) + 1
        : 1;

      const newTier = {
        id: nextId,
        minDays: Number(data.minDays),
        discountPercent: Number(data.discountPercent),
        description: data.description || '',
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        updatedBy: data.updatedBy ? Number(data.updatedBy) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.data.discountTiers.push(newTier);
      store.schedulePersist();
      return { ...newTier };
    });
  },

  async updateTier(id, patch) {
    store.init();
    return await store.mutex.runExclusive(async () => {
      if (!store.data.discountTiers) store.data.discountTiers = [];
      const index = store.data.discountTiers.findIndex((t) => Number(t.id) === Number(id));
      if (index === -1) return null;

      const existing = store.data.discountTiers[index];
      const updated = {
        ...existing,
        minDays: patch.minDays !== undefined ? Number(patch.minDays) : existing.minDays,
        discountPercent: patch.discountPercent !== undefined ? Number(patch.discountPercent) : existing.discountPercent,
        description: patch.description !== undefined ? patch.description : existing.description,
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : existing.isActive,
        updatedBy: patch.updatedBy !== undefined ? Number(patch.updatedBy) : existing.updatedBy,
        updatedAt: new Date().toISOString(),
      };

      store.data.discountTiers[index] = updated;
      store.schedulePersist();
      return { ...updated };
    });
  },

  async deleteTier(id) {
    store.init();
    return await store.mutex.runExclusive(async () => {
      if (!store.data.discountTiers) return false;
      const initialLen = store.data.discountTiers.length;
      store.data.discountTiers = store.data.discountTiers.filter((t) => Number(t.id) !== Number(id));
      const deleted = store.data.discountTiers.length < initialLen;
      if (deleted) store.schedulePersist();
      return deleted;
    });
  },
};

module.exports = pricingRepo;
