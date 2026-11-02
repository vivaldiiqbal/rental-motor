const { pool } = require('../../../db/pool');
const { RENTAL_RULES } = require('../../config/rules');
const { mapPickupLocation, mapAddon } = require('./mappers');

const metaRepo = {
  getRentalOptions() {
    return {
      pickupLocations: RENTAL_RULES.pickupLocations,
      addOns: RENTAL_RULES.addOns,
      deliveryFees: {
        pickup: RENTAL_RULES.deliveryFeePerTrip,
        dropoff: RENTAL_RULES.deliveryFeePerTrip,
        roundTrip: RENTAL_RULES.deliveryFeePerTrip * 2,
      },
      rules: {
        minDays: RENTAL_RULES.minDays,
        maxDays: RENTAL_RULES.maxDays,
        defaultDeposit: RENTAL_RULES.defaultDeposit,
        lateFeePercentPerHour: RENTAL_RULES.lateFeePercentPerHour,
        operationalHours: RENTAL_RULES.operationalHours,
      },
    };
  },

  async getPickupLocations(onlyActive = true, client = null) {
    const db = client || pool;
    let query = 'SELECT * FROM pickup_locations';
    if (onlyActive) query += ' WHERE is_active = true';
    query += ' ORDER BY sort_order ASC, id ASC';
    const res = await db.query(query);
    return res.rows.map(mapPickupLocation);
  },

  async getAddons(onlyActive = true, client = null) {
    const db = client || pool;
    let query = 'SELECT * FROM addons';
    if (onlyActive) query += ' WHERE is_active = true';
    query += ' ORDER BY id ASC';
    const res = await db.query(query);
    return res.rows.map(mapAddon);
  },
};

module.exports = metaRepo;
