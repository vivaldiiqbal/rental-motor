const { pool } = require('../../../db/pool');
const { handlePgError } = require('./errors');

function formatDateOnly(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string') return val.slice(0, 10);
  return String(val);
}

function mapPricingRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ruleType: row.rule_type,
    rateType: row.rate_type,
    rateValue: parseFloat(row.rate_value),
    scope: row.scope,
    targetMotorType: row.target_motor_type,
    targetMotorcycleId: row.target_motorcycle_id ? Number(row.target_motorcycle_id) : null,
    startDate: formatDateOnly(row.start_date),
    endDate: formatDateOnly(row.end_date),
    priority: row.priority,
    isActive: row.is_active,
    description: row.description || '',
    updatedBy: row.updated_by ? Number(row.updated_by) : null,
    createdAt: row.created_at ? (row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)) : null,
    updatedAt: row.updated_at ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)) : null,
  };
}

function mapDiscountTier(row) {
  if (!row) return null;
  return {
    id: row.id,
    minDays: row.min_days,
    discountPercent: parseFloat(row.discount_percent),
    description: row.description || '',
    isActive: row.is_active,
    updatedBy: row.updated_by ? Number(row.updated_by) : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

const pricingRepo = {
  // ================= PRICING RULES =================
  async findActiveRules(client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT * FROM pricing_rules
         WHERE is_active = true
         ORDER BY priority DESC, id ASC`,
      );
      return res.rows.map(mapPricingRule);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAllRules(filter = {}, client = null) {
    const db = client || pool;
    try {
      let query = 'SELECT * FROM pricing_rules';
      const conditions = [];
      const params = [];

      if (filter.isActive !== undefined) {
        params.push(Boolean(filter.isActive));
        conditions.push(`is_active = $${params.length}`);
      }
      if (filter.ruleType) {
        params.push(filter.ruleType);
        conditions.push(`rule_type = $${params.length}`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY priority DESC, id ASC';

      const res = await db.query(query, params);
      return res.rows.map(mapPricingRule);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findRuleById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM pricing_rules WHERE id = $1', [Number(id)]);
      return res.rows.length > 0 ? mapPricingRule(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async createRule(data, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `INSERT INTO pricing_rules (
           name, rule_type, rate_type, rate_value, scope,
           target_motor_type, target_motorcycle_id, start_date, end_date,
           priority, is_active, description, updated_by, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
         RETURNING *`,
        [
          data.name.trim(),
          data.ruleType,
          data.rateType,
          Number(data.rateValue),
          data.scope || 'all',
          data.targetMotorType || null,
          data.targetMotorcycleId ? Number(data.targetMotorcycleId) : null,
          data.startDate || null,
          data.endDate || null,
          data.priority !== undefined ? Number(data.priority) : 10,
          data.isActive !== undefined ? Boolean(data.isActive) : true,
          data.description || '',
          data.updatedBy ? Number(data.updatedBy) : null,
        ],
      );
      return mapPricingRule(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateRule(id, patch, client = null) {
    const db = client || pool;
    try {
      const existing = await this.findRuleById(id, db);
      if (!existing) return null;

      const merged = {
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
      };

      const res = await db.query(
        `UPDATE pricing_rules
         SET name = $1, rule_type = $2, rate_type = $3, rate_value = $4,
             scope = $5, target_motor_type = $6, target_motorcycle_id = $7,
             start_date = $8, end_date = $9, priority = $10, is_active = $11,
             description = $12, updated_by = $13, updated_at = now()
         WHERE id = $14
         RETURNING *`,
        [
          merged.name,
          merged.ruleType,
          merged.rateType,
          merged.rateValue,
          merged.scope,
          merged.targetMotorType,
          merged.targetMotorcycleId,
          merged.startDate,
          merged.endDate,
          merged.priority,
          merged.isActive,
          merged.description,
          merged.updatedBy,
          Number(id),
        ],
      );
      return res.rows.length > 0 ? mapPricingRule(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async deleteRule(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM pricing_rules WHERE id = $1 RETURNING id', [Number(id)]);
      return res.rows.length > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  // ================= DISCOUNT TIERS =================
  async findActiveTiers(client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT * FROM discount_tiers
         WHERE is_active = true
         ORDER BY min_days ASC`,
      );
      return res.rows.map(mapDiscountTier);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAllTiers(client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM discount_tiers ORDER BY min_days ASC');
      return res.rows.map(mapDiscountTier);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findTierById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT * FROM discount_tiers WHERE id = $1', [Number(id)]);
      return res.rows.length > 0 ? mapDiscountTier(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async createTier(data, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `INSERT INTO discount_tiers (min_days, discount_percent, description, is_active, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())
         RETURNING *`,
        [
          Number(data.minDays),
          Number(data.discountPercent),
          data.description || '',
          data.isActive !== undefined ? Boolean(data.isActive) : true,
          data.updatedBy ? Number(data.updatedBy) : null,
        ],
      );
      return mapDiscountTier(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateTier(id, patch, client = null) {
    const db = client || pool;
    try {
      const existing = await this.findTierById(id, db);
      if (!existing) return null;

      const merged = {
        minDays: patch.minDays !== undefined ? Number(patch.minDays) : existing.minDays,
        discountPercent: patch.discountPercent !== undefined ? Number(patch.discountPercent) : existing.discountPercent,
        description: patch.description !== undefined ? patch.description : existing.description,
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : existing.isActive,
        updatedBy: patch.updatedBy !== undefined ? Number(patch.updatedBy) : existing.updatedBy,
      };

      const res = await db.query(
        `UPDATE discount_tiers
         SET min_days = $1, discount_percent = $2, description = $3, is_active = $4, updated_by = $5, updated_at = now()
         WHERE id = $6
         RETURNING *`,
        [merged.minDays, merged.discountPercent, merged.description, merged.isActive, merged.updatedBy, Number(id)],
      );
      return res.rows.length > 0 ? mapDiscountTier(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async deleteTier(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM discount_tiers WHERE id = $1 RETURNING id', [Number(id)]);
      return res.rows.length > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = pricingRepo;
