const store = require('../store');
const { RENTAL_RULES } = require('../../config/rules');

const DEFAULT_SETTINGS = {
  brandName: process.env.BRAND_NAME || 'RodaKita Rental Motor',
  whatsappNumber: process.env.WHATSAPP_NUMBER || '081234567890',
  address: process.env.STORE_ADDRESS || 'Jl. Malioboro No. 123, Yogyakarta',
  contactEmail: process.env.CONTACT_EMAIL || 'support@rodakita.id',
  operatingHours: process.env.OPERATING_HOURS || RENTAL_RULES.operationalHours || '07.00 - 21.00 WIB',
  minRentalDays: parseInt(process.env.MIN_RENTAL_DAYS, 10) || RENTAL_RULES.minDays || 1,
  maxRentalDays: parseInt(process.env.MAX_RENTAL_DAYS, 10) || RENTAL_RULES.maxDays || 30,
  bookingExpireMinutes: parseInt(process.env.BOOKING_EXPIRE_MINUTES, 10) || RENTAL_RULES.bookingExpireMinutes || 60,
  paymentExpiryMinutes: parseInt(process.env.BOOKING_EXPIRE_MINUTES, 10) || RENTAL_RULES.bookingExpireMinutes || 60,
  lateFeeToleranceMinutes: parseInt(process.env.LATE_FEE_TOLERANCE_MINUTES, 10) || 120,
  lateFeePercentPerHour: parseInt(process.env.LATE_FEE_PERCENT_PER_HOUR, 10) || RENTAL_RULES.lateFeePercentPerHour || 10,
  defaultDeposit: parseInt(process.env.DEFAULT_DEPOSIT, 10) || RENTAL_RULES.defaultDeposit || 200000,
  minRenterAge: parseInt(process.env.MIN_RENTER_AGE, 10) || 17,
  cancellationThresholdHours: 24,
  cancellationRefundPercent: 75,
  cancellationPolicy: [
    { thresholdHours: 48, refundPercent: 100 },
    { thresholdHours: 24, refundPercent: 50 },
    { thresholdHours: 0, refundPercent: 0 },
  ],
  'gps.offline_minutes': 15,
  'gps.speed_limit_kmh': 80,
  'gps.low_battery_pct': 20,
  'gps.retention_days': 90,
  'gps.unauthorized_move_meters': 150,
  'gps.overdue_grace_minutes': 30,
  'gps.history_max_days_staff': 7,
  'gps.ui_throttle_seconds': 3,
};

/**
 * Kontrak Settings Repository:
 * - getSettings(): Promise<SystemSettings>
 * - updateSettings(patch): Promise<SystemSettings>
 * - resetSettings(): Promise<SystemSettings>
 */
const settingsRepo = {
  async getSettings() {
    if (!store.isLoaded) store.init();
    if (!store.data.settings || typeof store.data.settings !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }
    const settings = { ...DEFAULT_SETTINGS, ...store.data.settings };
    if (settings.bookingExpireMinutes && !settings.paymentExpiryMinutes) {
      settings.paymentExpiryMinutes = settings.bookingExpireMinutes;
    } else if (settings.paymentExpiryMinutes && !settings.bookingExpireMinutes) {
      settings.bookingExpireMinutes = settings.paymentExpiryMinutes;
    }
    return settings;
  },

  async updateSettings(patch) {
    return store.withLock(async (data) => {
      const current = (data.settings && typeof data.settings === 'object') ? data.settings : DEFAULT_SETTINGS;
      const updated = {
        ...DEFAULT_SETTINGS,
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      data.settings = updated;
      return { ...updated };
    });
  },

  async resetSettings() {
    return store.withLock(async (data) => {
      const reset = {
        ...DEFAULT_SETTINGS,
        updatedAt: new Date().toISOString(),
      };
      data.settings = reset;
      return { ...reset };
    });
  },
};

module.exports = settingsRepo;
