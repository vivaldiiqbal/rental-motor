const { RENTAL_RULES } = require('../../config/rules');

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
};

module.exports = metaRepo;
