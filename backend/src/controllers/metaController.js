const settingsService = require('../services/admin/settingsService');
const motorService = require('../services/motorService');
const { successResponse } = require('../utils/response');

const metaController = {
  async getRentalOptions(req, res) {
    const options = await motorService.getRentalOptions();
    return successResponse(res, {
      data: options,
    });
  },

  async getSiteMeta(req, res) {
    const settings = await settingsService.getSettings();
    const siteData = {
      brandName: settings.brandName,
      whatsappNumber: settings.whatsappNumber,
      address: settings.address,
      contactEmail: settings.contactEmail,
      operatingHours: settings.operatingHours,
      minRentalDays: settings.minRentalDays,
      maxRentalDays: settings.maxRentalDays,
      minRenterAge: settings.minRenterAge,
      bookingExpireMinutes: settings.bookingExpireMinutes,
      paymentExpiryMinutes: settings.paymentExpiryMinutes,
      lateFeeToleranceMinutes: settings.lateFeeToleranceMinutes,
      lateFeePercentPerHour: settings.lateFeePercentPerHour,
      defaultDeposit: settings.defaultDeposit,
      cancellationThresholdHours: settings.cancellationThresholdHours,
      cancellationRefundPercent: settings.cancellationRefundPercent,
      cancellationPolicy: settings.cancellationPolicy,
    };

    return successResponse(res, {
      data: siteData,
    });
  },
};

module.exports = metaController;
