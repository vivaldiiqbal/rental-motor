/**
 * Aturan bisnis rental motor RodaKita.
 * Dipusatkan di sini untuk menjamin konsistensi di seluruh service dan pengujian.
 */

const { BOOKING_STATUS } = require('./constants');

const RENTAL_RULES = {
  minDays: 1,
  maxDays: 30,
  maxAdvanceDays: 180, // Maksimal pemesanan ke depan 180 hari
  defaultDeposit: 200000,
  lateFeePercentPerHour: 10,
  bookingExpireMinutes: 60, // Batas waktu pembayaran sebelum booking expired
  paymentExpiryHours: 1, // Untuk backward-compatibility
  deliveryFeePerTrip: 25000, // Rp 25.000 per arah antar/jemput
  operationalHours: '07.00 - 21.00 WIB',

  // Aturan diskon durasi sewa
  durationDiscounts: [
    { minDays: 7, percent: 10 }, // 7+ hari diskon 10%
    { minDays: 3, percent: 5 },  // 3-6 hari diskon 5%
  ],

  // Tambahan akhir pekan (Sabtu & Minggu) jika WEEKEND_SURCHARGE=true
  weekendSurchargePercent: 10,

  // Aturan pembatalan oleh pelanggan
  cancellationPolicy: {
    pending: {
      feePercent: 0,
      refundRentalPercent: 0, // belum bayar
      note: 'Bebas biaya sebelum pembayaran.',
    },
    confirmed: {
      moreThan48Hours: {
        rentalRefundPercent: 100,
        depositRefundPercent: 100,
        feePercent: 0,
        note: 'Lebih dari 48 jam sebelum mulai: Refund 100% sewa dan 100% deposit.',
      },
      between24And48Hours: {
        rentalRefundPercent: 50,
        depositRefundPercent: 100,
        feePercent: 50,
        note: '24 s/d 48 jam sebelum mulai: Refund 50% sewa dan 100% deposit.',
      },
      lessThan24Hours: {
        rentalRefundPercent: 0,
        depositRefundPercent: 100,
        feePercent: 100,
        note: 'Kurang dari 24 jam sebelum mulai: Biaya sewa hangus, 100% deposit dikembalikan.',
      },
    },
  },

  // State Machine transisi status booking yang sah
  allowedStatusTransitions: {
    [BOOKING_STATUS.PENDING]: [
      BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.EXPIRED,
    ],
    [BOOKING_STATUS.CONFIRMED]: [
      BOOKING_STATUS.ACTIVE,
      BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.ACTIVE]: [
      BOOKING_STATUS.COMPLETED,
    ],
    [BOOKING_STATUS.COMPLETED]: [],
    [BOOKING_STATUS.CANCELLED]: [],
    [BOOKING_STATUS.EXPIRED]: [],
  },

  // Daftar Add-on yang tersedia
  addOns: [
    {
      id: 'extra_helmet',
      name: 'Helm Tambahan',
      pricePerDay: 10000,
      description: 'Helm SNI bersih dan wangi untuk boncenger',
    },
    {
      id: 'raincoat',
      name: 'Jas Hujan',
      pricePerDay: 5000,
      description: 'Jas hujan setelan ponco/celana anti bocor',
    },
    {
      id: 'phone_holder',
      name: 'Penyangga HP (Phone Holder)',
      pricePerDay: 5000,
      description: 'Phone holder stang kokoh dengan bantalan anti getar',
    },
  ],

  // Titik penjemputan / pengantaran resmi
  pickupLocations: [
    'Kantor Pusat RodaKita (Gratis)',
    'Bandara Internasional (Layanan Antar/Jemput)',
    'Stasiun Kereta Api (Layanan Antar/Jemput)',
    'Hotel / Villa Area (Layanan Antar/Jemput)',
  ],
};

/**
 * Validasi apakah transisi dari status lama ke status baru diizinkan.
 */
function isValidStatusTransition(fromStatus, toStatus) {
  const allowed = RENTAL_RULES.allowedStatusTransitions[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * Hitung kalkulasi pengembalian dana (refund) berdasarkan status dan sisa jam sebelum waktu sewa.
 */
function calculateCancellationRefund({ status, hoursUntilStart, hoursUntilPickup, totalRental = 0, deposit = 0, policySnapshot = null }) {
  const hours = hoursUntilStart !== undefined ? hoursUntilStart : (hoursUntilPickup !== undefined ? hoursUntilPickup : 0);

  if (status === BOOKING_STATUS.PENDING) {
    return {
      refundPercentage: 100,
      cancellationFee: 0,
      refundAmount: totalRental + deposit,
      note: 'Dibatalkan sebelum pembayaran (bebas biaya).',
    };
  }

  if (status === BOOKING_STATUS.CONFIRMED) {
    // 1. Cek policySnapshot.cancellationPolicy (array berjenjang)
    if (policySnapshot && Array.isArray(policySnapshot.cancellationPolicy) && policySnapshot.cancellationPolicy.length > 0) {
      const sortedTiers = [...policySnapshot.cancellationPolicy].sort((a, b) => Number(b.thresholdHours) - Number(a.thresholdHours));
      const matchedTier = sortedTiers.find((t) => hours >= Number(t.thresholdHours));
      const refundPercentage = matchedTier ? Number(matchedTier.refundPercent) : 0;
      const rentalRefund = Math.round((totalRental * refundPercentage) / 100);
      const cancellationFee = totalRental - rentalRefund;
      const refundAmount = rentalRefund + deposit;
      return {
        refundPercentage,
        cancellationFee,
        refundAmount,
        note: `${Math.round(hours)} jam sebelum jadwal: Refund ${refundPercentage}% biaya sewa dan 100% deposit.`,
      };
    }

    // 2. Cek policySnapshot nilai tunggal threshold & refundPercent
    if (policySnapshot && (policySnapshot.cancellationThresholdHours !== undefined || policySnapshot.cancellationRefundPercent !== undefined)) {
      const threshold = Number(policySnapshot.cancellationThresholdHours ?? 24);
      const refundPercent = Number(policySnapshot.cancellationRefundPercent ?? 50);
      if (hours >= threshold) {
        const rentalRefund = Math.round((totalRental * refundPercent) / 100);
        const cancellationFee = totalRental - rentalRefund;
        return {
          refundPercentage: refundPercent,
          cancellationFee,
          refundAmount: rentalRefund + deposit,
          note: `${Math.round(hours)} jam sebelum jadwal: Refund ${refundPercent}% biaya sewa dan 100% deposit.`,
        };
      } else {
        return {
          refundPercentage: 0,
          cancellationFee: totalRental,
          refundAmount: deposit,
          note: `Kurang dari ${threshold} jam sebelum jadwal: Biaya sewa hangus, deposit dikembalikan 100%.`,
        };
      }
    }

    // 3. Fallback default jika tidak ada snapshot
    if (hours > 48) {
      return {
        refundPercentage: 100,
        cancellationFee: 0,
        refundAmount: totalRental + deposit,
        note: 'Lebih dari 48 jam sebelum jadwal: Refund 100% biaya sewa dan 100% deposit.',
      };
    } else if (hours >= 24) {
      const rentalRefund = Math.round(totalRental * 0.5);
      const cancellationFee = totalRental - rentalRefund;
      return {
        refundPercentage: 50,
        cancellationFee,
        refundAmount: rentalRefund + deposit,
        note: '24-48 jam sebelum jadwal: Refund 50% biaya sewa dan 100% deposit.',
      };
    } else {
      return {
        refundPercentage: 0,
        cancellationFee: totalRental,
        refundAmount: deposit,
        note: 'Kurang dari 24 jam sebelum jadwal: Biaya sewa hangus, deposit dikembalikan 100%.',
      };
    }
  }

  return {
    refundPercentage: 0,
    cancellationFee: totalRental,
    refundAmount: 0,
    note: 'Status tidak memenuhi syarat refund.',
  };
}

module.exports = {
  RENTAL_RULES,
  isValidStatusTransition,
  calculateCancellationRefund,
};

