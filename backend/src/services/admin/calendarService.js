const { motorRepo, bookingRepo, maintenanceRepo } = require('../../repositories');
const { getNowWIB, toISODate, isOverlapping } = require('../../utils/dates');
const { format, startOfMonth, endOfMonth, parseISO, isValid } = require('date-fns');

const calendarService = {
  async getCalendarMatrix(monthStr) {
    let targetDate;
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      targetDate = parseISO(`${monthStr}-01`);
    } else {
      targetDate = getNowWIB();
    }

    if (!isValid(targetDate)) {
      targetDate = getNowWIB();
    }

    const monthFormatted = format(targetDate, 'yyyy-MM');
    const startOfM = startOfMonth(targetDate);
    const endOfM = endOfMonth(targetDate);
    const startDateStr = format(startOfM, 'yyyy-MM-dd');
    const endDateStr = format(endOfM, 'yyyy-MM-dd');
    const daysInMonth = endOfM.getDate();

    // Ambil motor, booking, dan servis
    const motorsRes = await motorRepo.findAll({}, { page: 1, limit: 1000 });
    const bookingsRes = await bookingRepo.findAll(
      { dateRange: { start: startDateStr, end: endDateStr } },
      { page: 1, limit: 2000 }
    );
    const maintenanceRes = await maintenanceRepo.findAll({}, { page: 1, limit: 1000 });

    const activeBookings = bookingsRes.items.filter(
      (b) =>
        ['pending', 'confirmed', 'active', 'completed'].includes(b.status) &&
        isOverlapping(startDateStr, endDateStr, b.startDate, b.endDate)
    );

    const activeMaintenance = maintenanceRes.items.filter(
      (m) =>
        m.status !== 'cancelled' &&
        isOverlapping(startDateStr, endDateStr, m.startDate, m.endDate)
    );

    const motors = motorsRes.items.map((motor) => {
      const motorBookings = activeBookings
        .filter((b) => Number(b.motorId) === Number(motor.id))
        .map((b) => ({
          id: b.id,
          type: 'booking',
          bookingCode: b.bookingCode || b.code,
          customerName: b.customerName || (b.customer && b.customer.name) || 'Pelanggan',
          startDate: b.startDate,
          endDate: b.endDate,
          status: b.status,
        }));

      const motorMaintenance = activeMaintenance
        .filter((m) => Number(m.motorId) === Number(motor.id))
        .map((m) => ({
          id: m.id,
          type: 'maintenance',
          reason: m.reason,
          technician: m.technician,
          startDate: m.startDate,
          endDate: m.endDate,
          status: m.status,
        }));

      return {
        id: motor.id,
        name: motor.name,
        plate: motor.plate,
        brand: motor.brand,
        status: motor.status,
        events: [...motorBookings, ...motorMaintenance],
      };
    });

    return {
      month: monthFormatted,
      daysInMonth,
      startDate: startDateStr,
      endDate: endDateStr,
      motors,
    };
  },
};

module.exports = calendarService;
