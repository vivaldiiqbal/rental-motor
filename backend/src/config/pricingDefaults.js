/**
 * Konfigurasi bawaan netral untuk Aturan Harga (Pricing Rules) & Tier Diskon Durasi Sewa.
 * Digunakan sebagai fallback saat basis data kosong atau terjadi kendala query.
 */

const DEFAULT_DISCOUNT_TIERS = [
  {
    id: 1,
    minDays: 3,
    discountPercent: 5.0,
    description: 'Diskon sewa 3 - 6 hari',
    isActive: true,
  },
  {
    id: 2,
    minDays: 7,
    discountPercent: 10.0,
    description: 'Diskon mingguan (7 hari ke atas)',
    isActive: true,
  },
  {
    id: 3,
    minDays: 30,
    discountPercent: 20.0,
    description: 'Diskon bulanan (30 hari)',
    isActive: true,
  },
];

const DEFAULT_PRICING_RULES = [
  {
    id: 1,
    name: 'Surcharge Akhir Pekan',
    ruleType: 'weekend',
    rateType: 'percentage',
    rateValue: 10.0,
    scope: 'all',
    targetMotorType: null,
    targetMotorcycleId: null,
    startDate: null,
    endDate: null,
    priority: 10,
    isActive: true,
    description: 'Biaya tambahan 10% sewa di hari Sabtu dan Minggu',
  },
];

const VALID_RULE_TYPES = ['weekend', 'seasonal', 'holiday', 'custom'];
const VALID_RATE_TYPES = ['percentage', 'fixed', 'multiplier'];
const VALID_SCOPES = ['all', 'motor_type', 'motorcycle'];
const VALID_MOTOR_TYPES = ['matic', 'manual', 'sport', 'trail', 'electric'];

/**
 * Validasi payload aturan harga baru / update.
 */
function validatePricingRule(payload, isUpdate = false) {
  const errors = [];

  if (!isUpdate || payload.name !== undefined) {
    if (!payload.name || typeof payload.name !== 'string' || payload.name.trim().length < 2 || payload.name.trim().length > 150) {
      errors.push('Nama aturan harus berupa teks 2 hingga 150 karakter.');
    }
  }

  if (!isUpdate || payload.ruleType !== undefined) {
    if (!VALID_RULE_TYPES.includes(payload.ruleType)) {
      errors.push(`Jenis aturan harus salah satu dari: ${VALID_RULE_TYPES.join(', ')}.`);
    }
  }

  if (!isUpdate || payload.rateType !== undefined) {
    if (!VALID_RATE_TYPES.includes(payload.rateType)) {
      errors.push(`Tipe tarif harus salah satu dari: ${VALID_RATE_TYPES.join(', ')}.`);
    }
  }

  if (!isUpdate || payload.rateValue !== undefined) {
    const val = Number(payload.rateValue);
    if (isNaN(val) || val < 0) {
      errors.push('Nilai tarif harus berupa angka non-negatif.');
    } else if (payload.rateType === 'percentage' && val > 200) {
      errors.push('Persentase tarif tidak boleh melebihi 200%.');
    } else if (payload.rateType === 'multiplier' && (val < 0.1 || val > 5)) {
      errors.push('Pengali tarif harus antara 0.1 hingga 5.0.');
    }
  }

  if (payload.scope !== undefined) {
    if (!VALID_SCOPES.includes(payload.scope)) {
      errors.push(`Cakupan harus salah satu dari: ${VALID_SCOPES.join(', ')}.`);
    }
    if (payload.scope === 'motor_type' && payload.targetMotorType && !VALID_MOTOR_TYPES.includes(payload.targetMotorType)) {
      errors.push(`Tipe motor harus salah satu dari: ${VALID_MOTOR_TYPES.join(', ')}.`);
    }
    if (payload.scope === 'motorcycle' && !payload.targetMotorcycleId) {
      errors.push('ID motor wajib diisi saat cakupan aturan adalah motorcycle.');
    }
  }

  const effectiveRuleType = payload.ruleType;
  if (['seasonal', 'holiday'].includes(effectiveRuleType)) {
    if (!payload.startDate || !payload.endDate) {
      errors.push('Tanggal mulai dan selesai wajib diisi untuk aturan seasonal/holiday.');
    } else if (new Date(payload.endDate) < new Date(payload.startDate)) {
      errors.push('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    }
  }

  if (payload.priority !== undefined) {
    const prio = Number(payload.priority);
    if (!Number.isInteger(prio) || prio < 0 || prio > 1000) {
      errors.push('Prioritas harus berupa bilangan bulat antara 0 hingga 1000.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validasi payload tier diskon durasi sewa.
 */
function validateDiscountTier(payload, isUpdate = false) {
  const errors = [];

  if (!isUpdate || payload.minDays !== undefined) {
    const minDays = Number(payload.minDays);
    if (!Number.isInteger(minDays) || minDays < 1 || minDays > 365) {
      errors.push('Durasi minimal hari (minDays) harus bilangan bulat antara 1 hingga 365 hari.');
    }
  }

  if (!isUpdate || payload.discountPercent !== undefined) {
    const pct = Number(payload.discountPercent);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      errors.push('Persentase diskon harus berupa angka antara 0% hingga 100%.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  DEFAULT_DISCOUNT_TIERS,
  DEFAULT_PRICING_RULES,
  VALID_RULE_TYPES,
  VALID_RATE_TYPES,
  VALID_SCOPES,
  VALID_MOTOR_TYPES,
  validatePricingRule,
  validateDiscountTier,
};
