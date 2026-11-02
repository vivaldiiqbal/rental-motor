/**
 * Data Referensi Sistem RodaKita untuk Seeding dan Metadata
 */
const { RENTAL_RULES } = require('../../src/config/rules');

module.exports = {
  pickupLocations: RENTAL_RULES.pickupLocations,
  addOns: RENTAL_RULES.addOns,
  rentalRules: {
    minDays: RENTAL_RULES.minDays,
    maxDays: RENTAL_RULES.maxDays,
    maxAdvanceDays: RENTAL_RULES.maxAdvanceDays,
    defaultDeposit: RENTAL_RULES.defaultDeposit,
    lateFeePercentPerHour: RENTAL_RULES.lateFeePercentPerHour,
    deliveryFeePerTrip: RENTAL_RULES.deliveryFeePerTrip,
    operationalHours: RENTAL_RULES.operationalHours,
    weekendSurchargePercent: RENTAL_RULES.weekendSurchargePercent,
  },
};
