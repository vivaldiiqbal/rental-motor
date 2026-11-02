const store = require('../store');
const { parseISO, differenceInCalendarDays } = require('date-fns');

const reportRepo = {
  async getRevenueReport(startDate, endDate, groupBy = 'daily') {
    const bookings = store.getCollection('bookings');
    const returns = store.getCollection('returns');
    const returnMap = new Map(returns.map((r) => [String(r.bookingId), r]));

    const validStatuses = ['confirmed', 'active', 'completed'];
    const groupedData = new Map();

    for (const b of bookings) {
      if (!validStatuses.includes(b.status)) continue;

      const paidAtRaw = b.paidAt || b.payment?.paidAt || b.createdAt;
      if (!paidAtRaw) continue;
      const paidDate = paidAtRaw.slice(0, 10);

      if (startDate && paidDate < startDate) continue;
      if (endDate && paidDate > endDate) continue;

      const rentalTotal = Number(b.rentalTotal || b.pricing?.totalPrice || (b.total - (b.deposit || 0)) || 0);
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
        groupKey = paidDate.slice(0, 7);
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
      },
    );

    return { items, totals };
  },

  async getUtilizationReport(startDate, endDate) {
    const motors = store.getCollection('motorcycles').filter((m) => m.status !== 'inactive');
    const bookings = store.getCollection('bookings');
    const totalActiveMotors = Math.max(1, motors.length);

    const startD = parseISO(startDate);
    const endD = parseISO(endDate);
    const totalDaysInPeriod = Math.max(1, differenceInCalendarDays(endD, startD) + 1);

    const validStatuses = ['confirmed', 'active', 'completed'];
    const motorDaysMap = new Map();

    for (const m of motors) {
      motorDaysMap.set(Number(m.id), 0);
    }

    for (const b of bookings) {
      if (!validStatuses.includes(b.status)) continue;
      const motorId = Number(b.motorId);
      if (!motorDaysMap.has(motorId)) continue;

      const bStart = b.startDate < startDate ? startDate : b.startDate;
      const bEnd = b.endDate > endDate ? endDate : b.endDate;

      if (bStart <= bEnd) {
        const days = differenceInCalendarDays(parseISO(bEnd), parseISO(bStart)) + 1;
        motorDaysMap.set(motorId, motorDaysMap.get(motorId) + Math.max(0, days));
      }
    }

    const breakdown = motors.map((m) => {
      const bookedDays = motorDaysMap.get(Number(m.id)) || 0;
      const rate = Math.min(100, Math.round((bookedDays / totalDaysInPeriod) * 100));
      return {
        motorId: m.id,
        motorName: m.name,
        plate: m.plate || m.plateNumber || '-',
        brand: m.brand,
        bookedDays,
        totalDays: totalDaysInPeriod,
        occupancyRatePercent: rate,
      };
    });

    const totalBookedDaysAcrossAll = Array.from(motorDaysMap.values()).reduce((a, b) => a + b, 0);
    const overallOccupancyRate = Math.min(
      100,
      Math.round((totalBookedDaysAcrossAll / (totalActiveMotors * totalDaysInPeriod)) * 100),
    );

    return {
      startDate,
      endDate,
      totalActiveMotors,
      totalDaysInPeriod,
      overallOccupancyRatePercent: overallOccupancyRate,
      breakdown,
    };
  },

  async getTopMotorsReport(startDate, endDate, limit = 5) {
    const motors = store.getCollection('motorcycles');
    const bookings = store.getCollection('bookings');
    const returns = store.getCollection('returns');
    const returnMap = new Map(returns.map((r) => [String(r.bookingId), r]));

    const statsMap = new Map();
    for (const m of motors) {
      statsMap.set(Number(m.id), {
        motorId: m.id,
        motorName: m.name,
        plate: m.plate || m.plateNumber || '-',
        brand: m.brand,
        rentalCount: 0,
        totalRevenue: 0,
      });
    }

    const validStatuses = ['confirmed', 'active', 'completed'];

    for (const b of bookings) {
      if (!validStatuses.includes(b.status)) continue;
      if (startDate && b.startDate < startDate) continue;
      if (endDate && b.startDate > endDate) continue;

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
      let rev = Number(b.rentalTotal || b.pricing?.totalPrice || (b.total - (b.deposit || 0)) || 0) - Number(b.refundAmount || 0);
      const ret = returnMap.get(String(b.id));
      if (ret) {
        rev += Number(ret.lateFee || 0) + Number(ret.damageFee || 0) + Number(ret.otherFee || 0);
      }
      entry.totalRevenue += rev;
    }

    return Array.from(statsMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue || b.rentalCount - a.rentalCount)
      .slice(0, Number(limit) || 5);
  },

  async getBookingsSummaryReport(startDate, endDate) {
    const bookings = store.getCollection('bookings');
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
      if (startDate && b.startDate < startDate) continue;
      if (endDate && b.startDate > endDate) continue;

      summary.total += 1;
      const amount = Number(b.grandTotal || b.totalAmount || b.pricing?.grandTotal || b.total || 0);
      if (summary[b.status]) {
        summary[b.status].count += 1;
        summary[b.status].totalAmount += amount;
      }
    }

    return summary;
  },
};

module.exports = reportRepo;
