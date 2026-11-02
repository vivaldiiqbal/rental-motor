const { pool } = require('../../../db/pool');
const { RENTAL_RULES } = require('../../config/rules');
const { handlePgError } = require('./errors');

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

const settingsRepo = {
  async getSettings(client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT key, value FROM app_settings');
      const settings = { ...DEFAULT_SETTINGS };
      for (const row of res.rows) {
        if (row.key === 'general' && typeof row.value === 'object' && row.value !== null) {
          Object.assign(settings, row.value);
        } else {
          settings[row.key] = row.value;
        }
      }
      if (settings.bookingExpireMinutes && !settings.paymentExpiryMinutes) {
        settings.paymentExpiryMinutes = settings.bookingExpireMinutes;
      } else if (settings.paymentExpiryMinutes && !settings.bookingExpireMinutes) {
        settings.bookingExpireMinutes = settings.paymentExpiryMinutes;
      }
      return settings;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateSettings(patch, client = null) {
    const db = client || pool;
    try {
      const current = await this.getSettings(db);
      const updated = { ...current, ...patch };

      for (const [key, val] of Object.entries(patch)) {
        await db.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = now()`,
          [key, JSON.stringify(val)],
        );
      }

      await db.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('general', $1::jsonb, now())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(updated)],
      );

      return {
        ...updated,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async resetSettings(client = null) {
    const db = client || pool;
    try {
      for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
        await db.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = now()`,
          [key, JSON.stringify(val)],
        );
      }
      await db.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('general', $1::jsonb, now())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(DEFAULT_SETTINGS)],
      );

      return {
        ...DEFAULT_SETTINGS,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = settingsRepo;
