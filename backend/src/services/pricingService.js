const { RENTAL_RULES } = require('../config/rules');
const { toIntegerMoney } = require('../utils/money');
const { countWeekendDays, isValidISODate, parseDate, toISODate } = require('../utils/dates');
const { DEFAULT_DISCOUNT_TIERS, DEFAULT_PRICING_RULES } = require('../config/pricingDefaults');
const { addDays, getDay } = require('date-fns');
const env = require('../config/env');
const logger = require('../utils/logger');

// Lazy-loaded repo to avoid circular dependencies
let pricingRepo = null;
function getPricingRepo() {
  if (!pricingRepo) {
    try {
      const repos = require('../repositories');
      pricingRepo = repos.pricingRepo;
    } catch (e) {
      /* ignore */
    }
  }
  return pricingRepo;
}

/**
 * Service kalkulasi harga sewa, aturan harga dinamis (weekend, seasonal, custom),
 * tier diskon durasi sewa, add-ons, ongkir antar-jemput, promo, dan deposit jaminan.
 */
class PricingService {
  constructor() {
    this._cachedRules = null;
    this._cachedTiers = null;
    this._cacheExpiresAt = 0;
    this._cacheTtlMs = 30000; // 30 detik
  }

  /**
   * Invalidasi cache aturan harga & tier diskon segera setelah ada update admin.
   */
  invalidateCache() {
    this._cachedRules = null;
    this._cachedTiers = null;
    this._cacheExpiresAt = 0;
  }

  /**
   * Muat aturan aktif dari basis data (dengan cache in-memory 30 detik).
   */
  async loadActivePricingConfig() {
    const now = Date.now();
    if (this._cachedRules && this._cachedTiers && now < this._cacheExpiresAt) {
      return {
        rules: this._cachedRules,
        tiers: this._cachedTiers,
      };
    }

    let rules = null;
    let tiers = null;
    const repo = getPricingRepo();

    if (repo) {
      try {
        rules = await repo.findActiveRules();
      } catch (err) {
        logger.warn(`[PRICING] Gagal memuat active rules dari basis data: ${err.message}. Menggunakan default.`);
      }
      try {
        tiers = await repo.findActiveTiers();
      } catch (err) {
        logger.warn(`[PRICING] Gagal memuat active tiers dari basis data: ${err.message}. Menggunakan default.`);
      }
    }

    if (!rules || rules.length === 0) {
      rules = [...DEFAULT_PRICING_RULES];
    }
    if (!tiers || tiers.length === 0) {
      tiers = [...DEFAULT_DISCOUNT_TIERS];
    }

    this._cachedRules = rules;
    this._cachedTiers = tiers;
    this._cacheExpiresAt = now + this._cacheTtlMs;

    return { rules, tiers };
  }

  /**
   * Evaluasi aturan harga aktif untuk unit motor dan rentang tanggal sewa.
   * Mengembalikan rincian surcharge per aturan yang cocok.
   */
  evaluatePricingRules({
    rules = [],
    pricePerDay,
    startDate,
    endDate,
    motorType = null,
    motorId = null,
  }) {
    if (!startDate || !endDate || !isValidISODate(startDate) || !isValidISODate(endDate)) {
      return {
        surcharges: [],
        totalSurcharge: 0,
        weekendDays: 0,
        weekendSurcharge: 0,
      };
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end <= start) {
      return {
        surcharges: [],
        totalSurcharge: 0,
        weekendDays: 0,
        weekendSurcharge: 0,
      };
    }

    // 1. Filter aturan yang cocok dengan scope motor
    const matchingRules = rules.filter((rule) => {
      if (!rule.isActive) return false;
      if (rule.scope === 'all') return true;
      if (rule.scope === 'motor_type' && motorType && rule.targetMotorType) {
        return rule.targetMotorType.toLowerCase() === motorType.toLowerCase();
      }
      if (rule.scope === 'motorcycle' && motorId && rule.targetMotorcycleId) {
        return Number(rule.targetMotorcycleId) === Number(motorId);
      }
      return false;
    });

    // Urutkan berdasarkan prioritas DESC, specificity DESC (motorcycle > motor_type > all), id ASC
    matchingRules.sort((a, b) => {
      if (b.priority !== a.priority) return (b.priority || 0) - (a.priority || 0);
      const specScore = (r) => (r.scope === 'motorcycle' ? 3 : r.scope === 'motor_type' ? 2 : 1);
      if (specScore(b) !== specScore(a)) return specScore(b) - specScore(a);
      return a.id - b.id;
    });

    const surcharges = [];
    let totalSurcharge = 0;
    let weekendDaysCount = 0;
    let weekendSurchargeAmount = 0;

    // Evaluasi tiap aturan
    for (const rule of matchingRules) {
      let matchingDays = 0;
      let cur = new Date(start);

      while (cur < end) {
        const curIso = toISODate(cur);
        const dayOfWeek = getDay(cur); // 0 = Minggu, 6 = Sabtu

        if (rule.ruleType === 'weekend') {
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            matchingDays++;
          }
        } else if (rule.ruleType === 'seasonal' || rule.ruleType === 'holiday') {
          if (rule.startDate && rule.endDate) {
            if (curIso >= rule.startDate && curIso <= rule.endDate) {
              matchingDays++;
            }
          }
        } else if (rule.ruleType === 'custom') {
          if (rule.startDate && rule.endDate) {
            if (curIso >= rule.startDate && curIso <= rule.endDate) {
              matchingDays++;
            }
          } else {
            // Berlaku flat untuk seluruh hari sewa jika tanggal tidak dibatasi
            matchingDays++;
          }
        }

        cur = addDays(cur, 1);
      }

      if (matchingDays > 0) {
        let dailyExtra = 0;
        if (rule.rateType === 'percentage') {
          dailyExtra = Math.round(pricePerDay * (rule.rateValue / 100));
        } else if (rule.rateType === 'fixed') {
          dailyExtra = Math.round(rule.rateValue);
        } else if (rule.rateType === 'multiplier') {
          dailyExtra = Math.max(0, Math.round(pricePerDay * (rule.rateValue - 1.0)));
        }

        const ruleTotal = dailyExtra * matchingDays;
        if (ruleTotal > 0) {
          surcharges.push({
            ruleId: rule.id,
            name: rule.name,
            ruleType: rule.ruleType,
            rateType: rule.rateType,
            rateValue: rule.rateValue,
            matchingDays,
            dailyExtra,
            amount: ruleTotal,
          });

          totalSurcharge += ruleTotal;

          if (rule.ruleType === 'weekend') {
            weekendDaysCount = matchingDays;
            weekendSurchargeAmount = ruleTotal;
          }
        }
      }
    }

    return {
      surcharges,
      totalSurcharge,
      weekendDays: weekendDaysCount,
      weekendSurcharge: weekendSurchargeAmount,
    };
  }

  /**
   * Cari tier diskon durasi sewa terbaik berdasarkan jumlah hari.
   */
  findBestDiscountTier(days, tiers = []) {
    const safeDays = Math.max(1, parseInt(days, 10) || 1);
    const activeTiers = (tiers || []).filter((t) => t.isActive !== false);

    // Cari tier yang memenuhi safeDays >= minDays dengan minDays terbesar
    const eligibleTiers = activeTiers
      .filter((t) => safeDays >= t.minDays)
      .sort((a, b) => b.minDays - a.minDays);

    if (eligibleTiers.length > 0) {
      return eligibleTiers[0];
    }

    return null;
  }

  /**
   * Kalkulasi harga sewa lengkap (asinkron, membaca aturan dari basis data).
   */
  async calculatePriceAsync(params) {
    const { rules, tiers } = await this.loadActivePricingConfig();
    return this.calculatePriceInternal(params, { rules, tiers });
  }

  /**
   * Kalkulasi harga sewa (sinkron, menggunakan cache aktif atau default).
   */
  calculatePrice(params) {
    const rules = this._cachedRules || DEFAULT_PRICING_RULES;
    const tiers = this._cachedTiers || DEFAULT_DISCOUNT_TIERS;
    return this.calculatePriceInternal(params, { rules, tiers });
  }

  /**
   * Logika inti kalkulasi harga sewa.
   */
  calculatePriceInternal(
    {
      pricePerDay,
      days,
      startDate,
      endDate,
      motorType = null,
      motorId = null,
      pickupMethod = 'store',
      delivery = {},
      addOnIds = [],
      addons = [],
      discount = 0,
      promoCode = null,
      deposit = 0,
    },
    { rules = [], tiers = [] } = {},
  ) {
    const safeDays = Math.max(1, parseInt(days, 10) || 1);
    const safePricePerDay = toIntegerMoney(pricePerDay);
    const subtotal = safePricePerDay * safeDays;

    // 1. Evaluasi Aturan Harga Tambahan (Weekend, Seasonal, Holiday, Custom)
    const { surcharges, totalSurcharge, weekendDays, weekendSurcharge } = this.evaluatePricingRules({
      rules,
      pricePerDay: safePricePerDay,
      startDate,
      endDate,
      motorType,
      motorId,
    });

    // 2. Evaluasi Diskon Durasi Sewa Dinamis dari discount_tiers
    let durationDiscountPercent = 0;
    let durationDiscount = 0;
    let appliedTier = null;

    const bestTier = this.findBestDiscountTier(safeDays, tiers);
    if (bestTier) {
      durationDiscountPercent = bestTier.discountPercent;
      durationDiscount = Math.round(subtotal * (bestTier.discountPercent / 100));
      appliedTier = {
        id: bestTier.id,
        minDays: bestTier.minDays,
        discountPercent: bestTier.discountPercent,
        description: bestTier.description,
      };
    } else if (tiers === null || tiers === undefined) {
      // Fallback lama jika tiers sama sekali tidak didefinisikan
      if (safeDays >= 7) {
        durationDiscountPercent = 10;
        durationDiscount = Math.round(subtotal * 0.10);
      } else if (safeDays >= 3) {
        durationDiscountPercent = 5;
        durationDiscount = Math.round(subtotal * 0.05);
      }
    }

    // 3. Biaya pengantaran dan penjemputan (masing-masing Rp 25.000 per arah)
    let deliveryFee = 0;
    let pickupFee = 0;
    let dropoffFee = 0;

    if (delivery && typeof delivery === 'object' && (delivery.pickup || delivery.dropoff)) {
      if (delivery.pickup) pickupFee = RENTAL_RULES.deliveryFeePerTrip;
      if (delivery.dropoff) dropoffFee = RENTAL_RULES.deliveryFeePerTrip;
      deliveryFee = pickupFee + dropoffFee;
    } else if (pickupMethod === 'delivery') {
      pickupFee = RENTAL_RULES.deliveryFeePerTrip;
      dropoffFee = RENTAL_RULES.deliveryFeePerTrip;
      deliveryFee = RENTAL_RULES.deliveryFeePerTrip * 2;
    }

    // 4. Hitung Add-ons (harga x hari x qty)
    const rawAddonList = Array.isArray(addons) && addons.length > 0 ? addons : (Array.isArray(addOnIds) ? addOnIds : []);
    let addOnsTotal = 0;
    const selectedAddOns = [];

    rawAddonList.forEach((entry) => {
      let addonId = typeof entry === 'string' ? entry : entry.id;
      let qty = typeof entry === 'object' && entry.qty ? Math.max(1, parseInt(entry.qty, 10)) : 1;

      const item = RENTAL_RULES.addOns.find((a) => a.id === addonId);
      if (item) {
        const itemTotal = item.pricePerDay * safeDays * qty;
        addOnsTotal += itemTotal;
        selectedAddOns.push({
          id: item.id,
          name: item.name,
          pricePerDay: item.pricePerDay,
          days: safeDays,
          qty,
          total: itemTotal,
        });
      }
    });

    // 5. Promo Diskon
    // Diskon promo tidak boleh membuat total sewa setelah diskon durasi menjadi negatif
    const maxPromoAllowed = Math.max(0, subtotal + totalSurcharge - durationDiscount);
    const safePromoDiscount = Math.min(maxPromoAllowed, toIntegerMoney(discount));

    // Total sewa setelah seluruh diskon
    const totalRental = Math.max(0, subtotal + totalSurcharge - durationDiscount - safePromoDiscount);

    // 6. Deposit jaminan
    const safeDeposit = toIntegerMoney(deposit !== undefined && deposit !== null ? deposit : RENTAL_RULES.defaultDeposit);

    // 7. Total yang dibayar pelanggan
    const total = totalRental + addOnsTotal + deliveryFee + safeDeposit;

    // 8. Rincian Line Items lengkap untuk respon transparan ke klien
    const lineItems = [
      {
        id: 'rental',
        type: 'rental',
        kind: 'rental',
        name: `Sewa Motor (${safeDays} hari)`,
        label: `Sewa Motor (${safeDays} hari)`,
        unitPrice: safePricePerDay,
        quantity: safeDays,
        days: safeDays,
        amount: subtotal,
      },
    ];

    // Tambahkan surcharge dinamis ke line items
    surcharges.forEach((sc, idx) => {
      lineItems.push({
        id: `surcharge_${sc.ruleType}_${idx}`,
        type: 'surcharge',
        kind: 'surcharge',
        name: `${sc.name} (${sc.matchingDays} hari)`,
        label: `${sc.name} (${sc.matchingDays} hari)`,
        unitPrice: sc.dailyExtra,
        quantity: sc.matchingDays,
        days: sc.matchingDays,
        amount: sc.amount,
        ruleId: sc.ruleId,
      });
    });

    if (durationDiscount > 0) {
      lineItems.push({
        id: 'duration_discount',
        type: 'discount',
        kind: 'discount_duration',
        name: `Diskon Durasi (${durationDiscountPercent}%)`,
        label: `Diskon Durasi (${durationDiscountPercent}%)`,
        amount: -durationDiscount,
      });
    }

    if (pickupFee > 0) {
      lineItems.push({
        id: 'delivery_pickup',
        type: 'delivery',
        kind: 'delivery',
        name: 'Biaya Pengantaran Unit',
        label: 'Biaya Pengantaran Unit',
        amount: pickupFee,
      });
    }

    if (dropoffFee > 0) {
      lineItems.push({
        id: 'delivery_dropoff',
        type: 'delivery',
        kind: 'delivery',
        name: 'Biaya Penjemputan Unit',
        label: 'Biaya Penjemputan Unit',
        amount: dropoffFee,
      });
    }

    selectedAddOns.forEach((addon) => {
      lineItems.push({
        id: addon.id,
        type: 'addon',
        kind: 'addon',
        name: `${addon.name} (${addon.qty}x, ${safeDays} hari)`,
        label: `${addon.name} (${addon.qty}x, ${safeDays} hari)`,
        unitPrice: addon.pricePerDay,
        quantity: addon.qty * safeDays,
        days: safeDays,
        amount: addon.total,
      });
    });

    if (safePromoDiscount > 0) {
      lineItems.push({
        id: 'promo_discount',
        type: 'discount',
        kind: 'discount_promo',
        name: promoCode ? `Kode Promo (${promoCode})` : 'Diskon Promo',
        label: promoCode ? `Kode Promo (${promoCode})` : 'Diskon Promo',
        amount: -safePromoDiscount,
      });
    }

    lineItems.push({
      id: 'deposit',
      type: 'deposit',
      kind: 'deposit',
      name: 'Deposit Jaminan (Dapat Dikembalikan)',
      label: 'Deposit Jaminan (Dapat Dikembalikan)',
      amount: safeDeposit,
    });

    // 9. Snapshot harga lengkap untuk disimpan pada booking agar kebal terhadap perubahan di masa depan
    const snapshot = {
      pricePerDay: safePricePerDay,
      days: safeDays,
      totalDays: safeDays,
      subtotal,
      totalSurcharge,
      surcharges,
      appliedRules: surcharges.map((s) => ({
        id: s.ruleId,
        name: s.name,
        ruleType: s.ruleType,
        matchingDays: s.matchingDays,
        amount: s.amount,
      })),
      appliedTier,
      weekendDays,
      weekendSurcharge,
      durationDiscountPercent,
      durationDiscount,
      deliveryFee,
      deliveryBreakdown: {
        pickup: pickupFee,
        dropoff: dropoffFee,
        total: deliveryFee,
      },
      addOnsTotal,
      selectedAddOns,
      promoCode: promoCode || null,
      promoDiscount: safePromoDiscount,
      totalRental,
      deposit: safeDeposit,
      total,
      grandTotal: total,
      lineItems,
    };

    return {
      pricePerDay: safePricePerDay,
      days: safeDays,
      subtotal,
      totalSurcharge,
      surcharges,
      weekendDays,
      weekendSurcharge,
      durationDiscountPercent,
      durationDiscount,
      deliveryFee,
      deliveryBreakdown: {
        pickup: pickupFee,
        dropoff: dropoffFee,
        total: deliveryFee,
      },
      addOnsTotal,
      selectedAddOns,
      discount: safePromoDiscount, // Alias untuk backward compatibility
      promoDiscount: safePromoDiscount,
      deposit: safeDeposit,
      totalRental,
      total,
      grandTotal: total,
      lineItems,
      snapshot,
    };
  }
}

module.exports = new PricingService();
