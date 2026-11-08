const { bookingRepo, motorRepo, userRepo, documentRepo, settingsRepo } = require('../../repositories');

/**
 * Service Dashboard Admin
 * Menghitung metrik kartu KPI, tugas hari ini, dan grafik pendapatan.
 */
const dashboardService = {
  async getSummary() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const nowWib = new Date();

    const [allBookingsRes, allMotorsRes, allUsersRes, allDocsRes] = await Promise.all([
      bookingRepo.findAll({}, { limit: 10000 }),
      motorRepo.findAll({}, { limit: 1000 }),
      userRepo.findAll({}, { limit: 1000 }),
      documentRepo.findAll({}, { limit: 1000 }),
    ]);

    const bookings = allBookingsRes.items;
    const motors = allMotorsRes.items;
    const docs = allDocsRes.items;

    // 1. Pengambilan hari ini (start_date === today, status confirmed)
    const todayPickups = bookings.filter(
      (b) => b.startDate === todayStr && b.status === 'confirmed',
    ).length;

    // 2. Pengembalian hari ini (end_date === today, status active)
    const todayReturns = bookings.filter(
      (b) => b.endDate === todayStr && b.status === 'active',
    ).length;

    // 3. Motor sedang disewa (status active)
    const activeRentals = bookings.filter((b) => b.status === 'active').length;

    // 4. Menunggu pembayaran (status pending)
    const pendingPayment = bookings.filter((b) => b.status === 'pending').length;

    // 5. Dokumen menunggu verifikasi
    const pendingDocuments = docs.filter((d) => d.status === 'pending').length;

    // 6. Booking terlambat kembali (status active dan scheduled return telah lewat)
    const overdueRentals = bookings.filter((b) => {
      if (b.status !== 'active') return false;
      const pickupTime = b.pickupTime || '09:00';
      const scheduled = new Date(`${b.endDate}T${pickupTime}:00+07:00`);
      return nowWib > scheduled;
    }).length;

    // 7. Pendapatan bulan ini vs bulan lalu (Single source of truth)
    const curMonthPrefix = todayStr.slice(0, 7); // YYYY-MM
    const prevMonthDate = new Date(nowWib.getFullYear(), nowWib.getMonth() - 1, 1);
    const prevMonthPrefix = prevMonthDate.toISOString().slice(0, 7);

    const calculateMonthRevenue = (prefix) => {
      return bookings
        .filter((b) => {
          const dateStr = b.paidAt || b.createdAt || '';
          return dateStr.startsWith(prefix) && ['confirmed', 'active', 'completed'].includes(b.status);
        })
        .reduce(
          (acc, b) => {
            const addOns = Number(b.addOnsTotal ?? b.addonsTotal ?? 0);
            const delivery = Number(b.deliveryTotal ?? b.deliveryFee ?? 0);
            const late = Number(b.lateFee ?? b.returnInfo?.lateFee ?? 0);
            const damage = Number(b.damageFee ?? b.returnInfo?.damageFee ?? 0);
            const other = Number(b.otherFee ?? b.returnInfo?.otherFee ?? 0);

            const rawSubtotal =
              b.subtotal !== undefined && b.subtotal !== null
                ? Number(b.subtotal)
                : Math.max(0, Number(b.rentalTotal ?? b.totalPrice ?? b.total ?? 0) - addOns - delivery);
            const refund = Number(b.refundAmount || 0);

            const motorRental = Math.max(0, rawSubtotal - refund);
            const otherRevenue = Math.max(0, addOns + late + damage + other + delivery);
            const totalNet = motorRental + otherRevenue;

            acc.motorRentalRevenue += motorRental;
            acc.otherRevenue += otherRevenue;
            acc.totalNetRevenue += totalNet;
            return acc;
          },
          { motorRentalRevenue: 0, otherRevenue: 0, totalNetRevenue: 0 }
        );
    };

    const curMonthRev = calculateMonthRevenue(curMonthPrefix);
    const prevMonthRev = calculateMonthRevenue(prevMonthPrefix);

    const monthlyRevenue = curMonthRev.totalNetRevenue;
    const monthlyMotorRentalRevenue = curMonthRev.motorRentalRevenue;
    const monthlyOtherRevenue = curMonthRev.otherRevenue;

    const prevMonthRevenue = prevMonthRev.totalNetRevenue;
    const prevMonthMotorRentalRevenue = prevMonthRev.motorRentalRevenue;
    const prevMonthOtherRevenue = prevMonthRev.otherRevenue;

    let revenueGrowthPercent = 0;
    if (prevMonthRevenue > 0) {
      revenueGrowthPercent = Math.round(((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 1000) / 10;
    } else if (monthlyRevenue > 0) {
      revenueGrowthPercent = 100;
    }

    // 8. Tingkat okupansi 30 hari terakhir
    const activeMotorsCount = motors.filter((m) => m.status === 'available' || m.status === 'maintenance').length || 1;
    const thirtyDaysAgoStr = new Date(nowWib.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const relevantBookings = bookings.filter(
      (b) =>
        ['confirmed', 'active', 'completed'].includes(b.status) &&
        b.endDate >= thirtyDaysAgoStr &&
        b.startDate <= todayStr,
    );

    let totalRentedMotorDays = 0;
    for (const b of relevantBookings) {
      const start = b.startDate < thirtyDaysAgoStr ? thirtyDaysAgoStr : b.startDate;
      const end = b.endDate > todayStr ? todayStr : b.endDate;
      const days = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));
      totalRentedMotorDays += days;
    }

    const totalPossibleMotorDays = activeMotorsCount * 30;
    const occupancyRate30Days = Math.min(
      100,
      Math.round((totalRentedMotorDays / totalPossibleMotorDays) * 1000) / 10,
    );

    return {
      todayPickups,
      todayReturns,
      activeRentals,
      pendingPayment,
      pendingDocuments,
      overdueRentals,
      monthlyRevenue,
      monthlyMotorRentalRevenue,
      monthlyOtherRevenue,
      prevMonthRevenue,
      revenueGrowthPercent,
      occupancyRate30Days,
    };
  },

  async getRevenue(daysParam = 30) {
    const days = Math.max(1, Math.min(90, Number(daysParam) || 30));
    const allBookingsRes = await bookingRepo.findAll({}, { limit: 10000 });
    const bookings = allBookingsRes.items;

    const result = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);

      const dayBookings = bookings.filter((b) => {
        const dStr = (b.paidAt || b.createdAt || '').slice(0, 10);
        return dStr === dateStr && ['confirmed', 'active', 'completed'].includes(b.status);
      });

      const revenue = dayBookings.reduce((sum, b) => {
        const rental = Number(b.rentalTotal || b.subtotal || b.totalPrice || (b.total - (b.deposit || 0))) || 0;
        const refund = Number(b.refundAmount) || 0;
        const late = Number(b.lateFee) || 0;
        const damage = Number(b.damageFee) || 0;
        const other = Number(b.otherFee) || 0;
        return sum + rental - refund + late + damage + other;
      }, 0);

      result.push({
        date: dateStr,
        revenue,
        bookingCount: dayBookings.length,
      });
    }

    return result;
  },

  async getTasks() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const nowWib = new Date();

    const [bookingsRes, docsRes, motorsRes] = await Promise.all([
      bookingRepo.findAll({}, { limit: 1000 }),
      documentRepo.findAll({ status: 'pending' }, { limit: 100 }),
      motorRepo.findAll({}, { limit: 1000 }),
    ]);

    const bookings = bookingsRes.items;
    const motorsMap = new Map(motorsRes.items.map((m) => [String(m.id), m]));

    const pickupsToday = bookings
      .filter((b) => b.startDate === todayStr && b.status === 'confirmed')
      .map((b) => ({
        bookingId: b.id,
        bookingCode: b.code,
        renterName: b.renter?.name || 'Pelanggan',
        motorName: motorsMap.get(String(b.motorId))?.name || 'Motor',
        time: b.pickupTime || '09:00',
      }));

    const returnsToday = bookings
      .filter((b) => b.endDate === todayStr && b.status === 'active')
      .map((b) => ({
        bookingId: b.id,
        bookingCode: b.code,
        renterName: b.renter?.name || 'Pelanggan',
        motorName: motorsMap.get(String(b.motorId))?.name || 'Motor',
        time: b.pickupTime || '17:00',
        isOverdue: false,
      }));

    const pendingDocs = docsRes.items.map((d) => ({
      userId: d.userId,
      userName: d.userName,
      type: d.type,
      uploadedAt: d.uploadedAt,
    }));

    const overdueReturns = bookings
      .filter((b) => {
        if (b.status !== 'active') return false;
        const scheduled = new Date(`${b.endDate}T${b.pickupTime || '09:00'}:00+07:00`);
        return nowWib > scheduled;
      })
      .map((b) => ({
        bookingId: b.id,
        bookingCode: b.code,
        renterName: b.renter?.name || 'Pelanggan',
        phone: b.renter?.phone || '-',
        scheduledReturn: `${b.endDate} ${b.pickupTime || '09:00'} WIB`,
      }));

    return {
      pickupsToday,
      returnsToday,
      pendingDocs,
      overdueReturns,
    };
  },
};

module.exports = dashboardService;
