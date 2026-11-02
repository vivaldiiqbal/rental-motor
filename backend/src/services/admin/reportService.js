const { bookingRepo, motorRepo, returnRepo, reportRepo } = require('../../repositories');
const { toISODate, getNowWIB, isValidISODate } = require('../../utils/dates');
const { toCsv } = require('../../utils/csv');
const { parseISO, subDays, differenceInCalendarDays, format } = require('date-fns');

// Fungsi murni untuk pengakuan pendapatan
function calculatePureRevenue(bookings, returns, startDateStr, endDateStr, groupBy = 'daily') {
  const returnMap = new Map();
  for (const ret of returns) {
    returnMap.set(String(ret.bookingId), ret);
  }

  const validStatuses = ['confirmed', 'active', 'completed'];
  const groupedData = new Map();

  for (const b of bookings) {
    if (!validStatuses.includes(b.status)) continue;

    // Tanggal pengakuan pendapatan = paid_at (WIB), fallback createdAt
    const paidAtRaw = b.paidAt || b.payment?.paidAt || b.createdAt;
    if (!paidAtRaw) continue;
    const paidDate = paidAtRaw.slice(0, 10);

    if (startDateStr && paidDate < startDateStr) continue;
    if (endDateStr && paidDate > endDateStr) continue;

    // Komponen pendapatan
    const rentalTotal = Number(b.rentalTotal || b.pricing?.totalPrice || 0);
    const refundAmount = Number(b.refundAmount || 0);
    let extraFees = 0;

    const returnRec = returnMap.get(String(b.id));
    if (returnRec) {
      extraFees += Number(returnRec.lateFee || 0);
      extraFees += Number(returnRec.damageFee || 0);
      extraFees += Number(returnRec.otherFee || 0);
    }

    const netRevenue = rentalTotal - refundAmount + extraFees;

    let groupKey = paidDate;
    if (groupBy === 'monthly') {
      groupKey = paidDate.slice(0, 7); // YYYY-MM
    }

    const current = groupedData.get(groupKey) || {
      period: groupKey,
      bookingCount: 0,
      rentalTotal: 0,
      refundAmount: 0,
      lateFee: 0,
      damageFee: 0,
      otherFee: 0,
      netRevenue: 0,
    };

    current.bookingCount += 1;
    current.rentalTotal += rentalTotal;
    current.refundAmount += refundAmount;
    if (returnRec) {
      current.lateFee += Number(returnRec.lateFee || 0);
      current.damageFee += Number(returnRec.damageFee || 0);
      current.otherFee += Number(returnRec.otherFee || 0);
    }
    current.netRevenue += netRevenue;

    groupedData.set(groupKey, current);
  }

  const items = Array.from(groupedData.values()).sort((a, b) => a.period.localeCompare(b.period));
  const totals = items.reduce(
    (acc, curr) => {
      acc.totalBookings += curr.bookingCount;
      acc.totalRental += curr.rentalTotal;
      acc.totalRefund += curr.refundAmount;
      acc.totalLateFee += curr.lateFee;
      acc.totalDamageFee += curr.damageFee;
      acc.totalOtherFee += curr.otherFee;
      acc.totalNetRevenue += curr.netRevenue;
      return acc;
    },
    {
      totalBookings: 0,
      totalRental: 0,
      totalRefund: 0,
      totalLateFee: 0,
      totalDamageFee: 0,
      totalOtherFee: 0,
      totalNetRevenue: 0,
    }
  );

  return { items, totals };
}

// Fungsi murni untuk okupansi motor
function calculatePureUtilization(motors, bookings, startDateStr, endDateStr) {
  const activeMotors = motors.filter((m) => m.status !== 'inactive');
  const totalActiveMotors = Math.max(1, activeMotors.length);

  const startD = parseISO(startDateStr);
  const endD = parseISO(endDateStr);
  const totalDaysInPeriod = Math.max(1, differenceInCalendarDays(endD, startD) + 1);

  const validStatuses = ['confirmed', 'active', 'completed'];
  const motorDaysMap = new Map();

  for (const m of activeMotors) {
    motorDaysMap.set(Number(m.id), 0);
  }

  for (const b of bookings) {
    if (!validStatuses.includes(b.status)) continue;
    const motorId = Number(b.motorId);
    if (!motorDaysMap.has(motorId)) continue;

    // Hitung irisan hari booking dalam window [startDate, endDate]
    const bStart = b.startDate < startDateStr ? startDateStr : b.startDate;
    const bEnd = b.endDate > endDateStr ? endDateStr : b.endDate;

    if (bStart <= bEnd) {
      const days = differenceInCalendarDays(parseISO(bEnd), parseISO(bStart)) + 1;
      motorDaysMap.set(motorId, motorDaysMap.get(motorId) + Math.max(0, days));
    }
  }

  const breakdown = activeMotors.map((m) => {
    const bookedDays = motorDaysMap.get(Number(m.id)) || 0;
    const rate = Math.min(100, Math.round((bookedDays / totalDaysInPeriod) * 100));
    return {
      motorId: m.id,
      motorName: m.name,
      plate: m.plate,
      brand: m.brand,
      bookedDays,
      totalDays: totalDaysInPeriod,
      occupancyRatePercent: rate,
    };
  });

  const totalBookedDaysAcrossAll = Array.from(motorDaysMap.values()).reduce((a, b) => a + b, 0);
  const overallOccupancyRate = Math.min(
    100,
    Math.round((totalBookedDaysAcrossAll / (totalActiveMotors * totalDaysInPeriod)) * 100)
  );

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalActiveMotors,
    totalDaysInPeriod,
    overallOccupancyRatePercent: overallOccupancyRate,
    breakdown,
  };
}

// Fungsi murni untuk motor terlaris
function calculatePureTopMotors(motors, bookings, returns, startDateStr, endDateStr, limit = 5) {
  const returnMap = new Map();
  for (const ret of returns) {
    returnMap.set(String(ret.bookingId), ret);
  }

  const statsMap = new Map();
  for (const m of motors) {
    statsMap.set(Number(m.id), {
      motorId: m.id,
      motorName: m.name,
      plate: m.plate,
      brand: m.brand,
      rentalCount: 0,
      totalRevenue: 0,
    });
  }

  const validStatuses = ['confirmed', 'active', 'completed'];

  for (const b of bookings) {
    if (!validStatuses.includes(b.status)) continue;
    if (startDateStr && b.startDate < startDateStr) continue;
    if (endDateStr && b.startDate > endDateStr) continue;

    const motorId = Number(b.motorId);
    let entry = statsMap.get(motorId);
    if (!entry) {
      entry = {
        motorId,
        motorName: b.motorName || 'Motor',
        plate: '-',
        brand: '-',
        rentalCount: 0,
        totalRevenue: 0,
      };
      statsMap.set(motorId, entry);
    }

    entry.rentalCount += 1;
    let rev = Number(b.rentalTotal || b.pricing?.totalPrice || 0) - Number(b.refundAmount || 0);
    const ret = returnMap.get(String(b.id));
    if (ret) {
      rev += Number(ret.lateFee || 0) + Number(ret.damageFee || 0) + Number(ret.otherFee || 0);
    }
    entry.totalRevenue += rev;
  }

  const sorted = Array.from(statsMap.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue || b.rentalCount - a.rentalCount)
    .slice(0, Number(limit) || 5);

  return sorted;
}

// Fungsi murni untuk ringkasan status booking
function calculatePureBookingsSummary(bookings, startDateStr, endDateStr) {
  const summary = {
    total: 0,
    pending: { count: 0, totalAmount: 0 },
    confirmed: { count: 0, totalAmount: 0 },
    active: { count: 0, totalAmount: 0 },
    completed: { count: 0, totalAmount: 0 },
    cancelled: { count: 0, totalAmount: 0 },
    expired: { count: 0, totalAmount: 0 },
  };

  for (const b of bookings) {
    if (startDateStr && b.startDate < startDateStr) continue;
    if (endDateStr && b.startDate > endDateStr) continue;

    summary.total += 1;
    const amount = Number(b.grandTotal || b.totalAmount || b.pricing?.grandTotal || 0);
    if (summary[b.status]) {
      summary[b.status].count += 1;
      summary[b.status].totalAmount += amount;
    }
  }

  return summary;
}

const reportService = {
  calculatePureRevenue,
  calculatePureUtilization,
  calculatePureTopMotors,
  calculatePureBookingsSummary,

  async getRevenueReport(query = {}) {
    const { startDate, endDate, groupBy = 'daily', format: outputFormat } = query;
    const now = getNowWIB();
    const startStr = startDate || toISODate(subDays(now, 30));
    const endStr = endDate || toISODate(now);

    const data = (reportRepo && typeof reportRepo.getRevenueReport === 'function')
      ? await reportRepo.getRevenueReport(startStr, endStr, groupBy)
      : calculatePureRevenue(
          (await bookingRepo.findAll({}, { page: 1, limit: 10000 })).items,
          require('../../repositories/store').getCollection ? require('../../repositories/store').getCollection('returns') : [],
          startStr,
          endStr,
          groupBy,
        );

    if (outputFormat === 'csv') {
      const columns = [
        { key: 'period', label: 'Periode' },
        { key: 'bookingCount', label: 'Jumlah Sewa' },
        { key: 'rentalTotal', label: 'Total Sewa Unit (Rp)' },
        { key: 'refundAmount', label: 'Refund (Rp)' },
        { key: 'lateFee', label: 'Denda Keterlambatan (Rp)' },
        { key: 'damageFee', label: 'Biaya Kerusakan (Rp)' },
        { key: 'otherFee', label: 'Biaya Lainnya (Rp)' },
        { key: 'netRevenue', label: 'Pendapatan Bersih (Rp)' },
      ];
      return {
        isCsv: true,
        csv: toCsv(data.items, columns),
        filename: `laporan-pendapatan-${startStr}-sd-${endStr}.csv`,
      };
    }

    return {
      startDate: startStr,
      endDate: endStr,
      groupBy,
      ...data,
    };
  },

  async getUtilizationReport(query = {}) {
    const { startDate, endDate, format: outputFormat } = query;
    const now = getNowWIB();
    const startStr = startDate || toISODate(subDays(now, 30));
    const endStr = endDate || toISODate(now);

    const data = (reportRepo && typeof reportRepo.getUtilizationReport === 'function')
      ? await reportRepo.getUtilizationReport(startStr, endStr)
      : calculatePureUtilization(
          (await motorRepo.findAll({}, { page: 1, limit: 1000 })).items,
          (await bookingRepo.findAll({}, { page: 1, limit: 10000 })).items,
          startStr,
          endStr,
        );

    if (outputFormat === 'csv') {
      const columns = [
        { key: 'motorName', label: 'Nama Motor' },
        { key: 'plate', label: 'Plat Nomor' },
        { key: 'brand', label: 'Merek' },
        { key: 'bookedDays', label: 'Hari Terisi' },
        { key: 'totalDays', label: 'Total Hari Periode' },
        { key: 'occupancyRatePercent', label: 'Okupansi (%)' },
      ];
      return {
        isCsv: true,
        csv: toCsv(data.breakdown, columns),
        filename: `laporan-okupansi-${startStr}-sd-${endStr}.csv`,
      };
    }

    return data;
  },

  async getTopMotorsReport(query = {}) {
    const { startDate, endDate, limit = 5, format: outputFormat } = query;
    const now = getNowWIB();
    const startStr = startDate || toISODate(subDays(now, 30));
    const endStr = endDate || toISODate(now);

    const topMotors = (reportRepo && typeof reportRepo.getTopMotorsReport === 'function')
      ? await reportRepo.getTopMotorsReport(startStr, endStr, limit)
      : calculatePureTopMotors(
          (await motorRepo.findAll({}, { page: 1, limit: 1000 })).items,
          (await bookingRepo.findAll({}, { page: 1, limit: 10000 })).items,
          require('../../repositories/store').getCollection ? require('../../repositories/store').getCollection('returns') : [],
          startStr,
          endStr,
          limit,
        );

    if (outputFormat === 'csv') {
      const columns = [
        { key: 'motorName', label: 'Nama Motor' },
        { key: 'plate', label: 'Plat Nomor' },
        { key: 'brand', label: 'Merek' },
        { key: 'rentalCount', label: 'Frekuensi Sewa' },
        { key: 'totalRevenue', label: 'Total Pendapatan (Rp)' },
      ];
      return {
        isCsv: true,
        csv: toCsv(topMotors, columns),
        filename: `laporan-motor-terlaris-${startStr}-sd-${endStr}.csv`,
      };
    }

    return {
      startDate: startStr,
      endDate: endStr,
      items: topMotors,
    };
  },

  async getBookingsSummaryReport(query = {}) {
    const { startDate, endDate, format: outputFormat } = query;
    const now = getNowWIB();
    const startStr = startDate || toISODate(subDays(now, 30));
    const endStr = endDate || toISODate(now);

    const summary = (reportRepo && typeof reportRepo.getBookingsSummaryReport === 'function')
      ? await reportRepo.getBookingsSummaryReport(startStr, endStr)
      : calculatePureBookingsSummary(
          (await bookingRepo.findAll({}, { page: 1, limit: 10000 })).items,
          startStr,
          endStr,
        );

    if (outputFormat === 'csv') {
      const rows = [
        { status: 'Menunggu Pembayaran (Pending)', count: summary.pending.count, totalAmount: summary.pending.totalAmount },
        { status: 'Terkonfirmasi (Confirmed)', count: summary.confirmed.count, totalAmount: summary.confirmed.totalAmount },
        { status: 'Sedang Disewa (Active)', count: summary.active.count, totalAmount: summary.active.totalAmount },
        { status: 'Selesai (Completed)', count: summary.completed.count, totalAmount: summary.completed.totalAmount },
        { status: 'Dibatalkan (Cancelled)', count: summary.cancelled.count, totalAmount: summary.cancelled.totalAmount },
        { status: 'Kedaluwarsa (Expired)', count: summary.expired.count, totalAmount: summary.expired.totalAmount },
      ];
      const columns = [
        { key: 'status', label: 'Status Pemesanan' },
        { key: 'count', label: 'Jumlah Transaksi' },
        { key: 'totalAmount', label: 'Total Nilai (Rp)' },
      ];
      return {
        isCsv: true,
        csv: toCsv(rows, columns),
        filename: `laporan-ringkasan-booking-${startStr}-sd-${endStr}.csv`,
      };
    }

    return {
      startDate: startStr,
      endDate: endStr,
      summary,
    };
  },
};

module.exports = reportService;
