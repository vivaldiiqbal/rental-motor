const { pricingRepo } = require('../../repositories');
const pricingService = require('../../services/pricingService');
const { recordAudit } = require('../../middleware/audit');
const { validatePricingRule, validateDiscountTier } = require('../../config/pricingDefaults');
const AppError = require('../../utils/AppError');

const pricingAdminController = {
  // ================= PRICING RULES =================
  async listPricingRules(req, res, next) {
    try {
      const filter = {};
      if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === 'true';
      }
      if (req.query.ruleType) {
        filter.ruleType = req.query.ruleType;
      }

      const rules = await pricingRepo.findAllRules(filter);
      return res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (err) {
      next(err);
    }
  },

  async getPricingRule(req, res, next) {
    try {
      const rule = await pricingRepo.findRuleById(req.params.id);
      if (!rule) {
        throw new AppError('Aturan harga tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404);
      }
      return res.status(200).json({
        success: true,
        data: rule,
      });
    } catch (err) {
      next(err);
    }
  },

  async createPricingRule(req, res, next) {
    try {
      const { isValid, errors } = validatePricingRule(req.body, false);
      if (!isValid) {
        throw new AppError(errors[0], 'VALIDATION_ERROR', 400, { errors });
      }

      const newRule = await pricingRepo.createRule({
        ...req.body,
        updatedBy: req.user?.id || null,
      });

      pricingService.invalidateCache();

      await recordAudit(req, 'CREATE_PRICING_RULE', 'PricingRule', newRule.id, null, newRule);

      return res.status(201).json({
        success: true,
        data: newRule,
        message: 'Aturan harga berhasil ditambahkan.',
      });
    } catch (err) {
      next(err);
    }
  },

  async updatePricingRule(req, res, next) {
    try {
      const existing = await pricingRepo.findRuleById(req.params.id);
      if (!existing) {
        throw new AppError('Aturan harga tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404);
      }

      const { isValid, errors } = validatePricingRule(req.body, true);
      if (!isValid) {
        throw new AppError(errors[0], 'VALIDATION_ERROR', 400, { errors });
      }

      const updated = await pricingRepo.updateRule(req.params.id, {
        ...req.body,
        updatedBy: req.user?.id || null,
      });

      pricingService.invalidateCache();

      await recordAudit(req, 'UPDATE_PRICING_RULE', 'PricingRule', updated.id, existing, updated);

      return res.status(200).json({
        success: true,
        data: updated,
        message: 'Aturan harga berhasil diperbarui.',
      });
    } catch (err) {
      next(err);
    }
  },

  async deletePricingRule(req, res, next) {
    try {
      const existing = await pricingRepo.findRuleById(req.params.id);
      if (!existing) {
        throw new AppError('Aturan harga tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404);
      }

      await pricingRepo.deleteRule(req.params.id);
      pricingService.invalidateCache();

      await recordAudit(req, 'DELETE_PRICING_RULE', 'PricingRule', req.params.id, existing, null);

      return res.status(200).json({
        success: true,
        message: 'Aturan harga berhasil dihapus.',
      });
    } catch (err) {
      next(err);
    }
  },

  // ================= DISCOUNT TIERS =================
  async listDiscountTiers(req, res, next) {
    try {
      const tiers = await pricingRepo.findAllTiers();
      return res.status(200).json({
        success: true,
        data: tiers,
      });
    } catch (err) {
      next(err);
    }
  },

  async getDiscountTier(req, res, next) {
    try {
      const tier = await pricingRepo.findTierById(req.params.id);
      if (!tier) {
        throw new AppError('Tier diskon tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404);
      }
      return res.status(200).json({
        success: true,
        data: tier,
      });
    } catch (err) {
      next(err);
    }
  },

  async createDiscountTier(req, res, next) {
    try {
      const { isValid, errors } = validateDiscountTier(req.body, false);
      if (!isValid) {
        throw new AppError(errors[0], 'VALIDATION_ERROR', 400, { errors });
      }

      const newTier = await pricingRepo.createTier({
        ...req.body,
        updatedBy: req.user?.id || null,
      });

      pricingService.invalidateCache();

      await recordAudit(req, 'CREATE_DISCOUNT_TIER', 'DiscountTier', newTier.id, null, newTier);

      return res.status(201).json({
        success: true,
        data: newTier,
        message: 'Tier diskon berhasil ditambahkan.',
      });
    } catch (err) {
      next(err);
    }
  },

  async updateDiscountTier(req, res, next) {
    try {
      const existing = await pricingRepo.findTierById(req.params.id);
      if (!existing) {
        throw new AppError('Tier diskon tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404);
      }

      const { isValid, errors } = validateDiscountTier(req.body, true);
      if (!isValid) {
        throw new AppError(errors[0], 'VALIDATION_ERROR', 400, { errors });
      }

      const updated = await pricingRepo.updateTier(req.params.id, {
        ...req.body,
        updatedBy: req.user?.id || null,
      });

      pricingService.invalidateCache();

      await recordAudit(req, 'UPDATE_DISCOUNT_TIER', 'DiscountTier', updated.id, existing, updated);

      return res.status(200).json({
        success: true,
        data: updated,
        message: 'Tier diskon berhasil diperbarui.',
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteDiscountTier(req, res, next) {
    try {
      const existing = await pricingRepo.findTierById(req.params.id);
      if (!existing) {
        throw new AppError('Tier diskon tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404);
      }

      await pricingRepo.deleteTier(req.params.id);
      pricingService.invalidateCache();

      await recordAudit(req, 'DELETE_DISCOUNT_TIER', 'DiscountTier', req.params.id, existing, null);

      return res.status(200).json({
        success: true,
        message: 'Tier diskon berhasil dihapus.',
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = pricingAdminController;
