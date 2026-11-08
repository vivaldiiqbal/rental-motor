const { pool } = require('../../../db/pool');
const { handlePgError } = require('./errors');

const reportRepo = {
  async getRevenueReport(startDate, endDate, groupBy = 'daily', client = null) {
    const db = client || pool;
    try {
      const formatStr = groupBy === 'monthly' ? 'YYYY-MM' : 'YYYY-MM-DD';

      const res = await db.query(
        `WITH booking_data AS (
           SELECT
             b.id,
             (COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta') AS paid_wib,
             b.rental_total,
             b.refund_amount,
             COALESCE(br.late_fee, 0) AS late_fee,
             COALESCE(br.damage_fee, 0) AS damage_fee,
             COALESCE(br.other_fee, 0) AS other_fee
           FROM bookings b
           LEFT JOIN booking_returns br ON br.booking_id = b.id
           WHERE b.status IN ('confirmed', 'active', 'completed')
             AND (COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta')::date >= $1::date
             AND (COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta')::date <= $2::date
         )
         SELECT
           to_char(paid_wib, $3) AS period,
           COUNT(*)::int AS "bookingCount",
           COALESCE(SUM(rental_total), 0)::int AS "rentalTotal",
           COALESCE(SUM(refund_amount), 0)::int AS "refundAmount",
           COALESCE(SUM(late_fee), 0)::int AS "lateFee",
           COALESCE(SUM(damage_fee), 0)::int AS "damageFee",
           COALESCE(SUM(other_fee), 0)::int AS "otherFee",
           COALESCE(SUM(rental_total - refund_amount + late_fee + damage_fee + other_fee), 0)::int AS "netRevenue"
         FROM booking_data
         GROUP BY period
         ORDER BY period ASC`,
        [startDate, endDate, formatStr],
      );

      const items = res.rows;
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
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getUtilizationReport(startDate, endDate, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `WITH active_motors AS (
           SELECT id, name, plate_number AS plate, brand
           FROM motorcycles
           WHERE status <> 'inactive'
         ),
         booked_days_per_motor AS (
           SELECT
             b.motorcycle_id,
             SUM(
               GREATEST(0,
                 LEAST(b.end_date, $2::date + 1) - GREATEST(b.start_date, $1::date)
               )
             )::int AS booked_days
           FROM bookings b
           WHERE b.status IN ('confirmed', 'active', 'completed')
             AND b.start_date <= $2::date
             AND b.end_date > $1::date
           GROUP BY b.motorcycle_id
         )
         SELECT
           m.id AS "motorId",
           m.name AS "motorName",
           m.plate,
           m.brand,
           COALESCE(bd.booked_days, 0)::int AS "bookedDays",
           ($2::date - $1::date + 1)::int AS "totalDays",
           LEAST(100, ROUND((COALESCE(bd.booked_days, 0)::numeric / GREATEST(1, ($2::date - $1::date + 1))) * 100))::int AS "occupancyRatePercent"
         FROM active_motors m
         LEFT JOIN booked_days_per_motor bd ON bd.motorcycle_id = m.id
         ORDER BY m.id ASC`,
        [startDate, endDate],
      );

      const breakdown = res.rows;
      const totalActiveMotors = Math.max(1, breakdown.length);
      const totalDaysInPeriod = breakdown.length > 0 ? breakdown[0].totalDays : 1;
      const totalBookedDaysAcrossAll = breakdown.reduce((sum, m) => sum + m.bookedDays, 0);
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
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getTopMotorsReport(startDate, endDate, limit = 5, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT
           m.id AS "motorId",
           m.name AS "motorName",
           m.plate_number AS plate,
           m.brand,
           COUNT(b.id)::int AS "rentalCount",
           COALESCE(SUM(b.rental_total - b.refund_amount + COALESCE(br.late_fee, 0) + COALESCE(br.damage_fee, 0) + COALESCE(br.other_fee, 0)), 0)::int AS "totalRevenue"
         FROM motorcycles m
         JOIN bookings b ON b.motorcycle_id = m.id
         LEFT JOIN booking_returns br ON br.booking_id = b.id
         WHERE b.status IN ('confirmed', 'active', 'completed')
           AND ($1::date IS NULL OR b.start_date >= $1::date)
           AND ($2::date IS NULL OR b.start_date <= $2::date)
         GROUP BY m.id, m.name, m.plate_number, m.brand
         ORDER BY "totalRevenue" DESC, "rentalCount" DESC
         LIMIT $3`,
        [startDate || null, endDate || null, Math.max(1, Number(limit) || 5)],
      );
      return res.rows;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getBookingsSummaryReport(startDate, endDate, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT
           status,
           COUNT(*)::int AS count,
           COALESCE(SUM(grand_total), 0)::int AS "totalAmount"
         FROM bookings
         WHERE ($1::date IS NULL OR start_date >= $1::date)
           AND ($2::date IS NULL OR start_date <= $2::date)
         GROUP BY status`,
        [startDate || null, endDate || null],
      );

      const summary = {
        total: 0,
        pending: { count: 0, totalAmount: 0 },
        confirmed: { count: 0, totalAmount: 0 },
        active: { count: 0, totalAmount: 0 },
        completed: { count: 0, totalAmount: 0 },
        cancelled: { count: 0, totalAmount: 0 },
        expired: { count: 0, totalAmount: 0 },
      };

      for (const row of res.rows) {
        if (summary[row.status]) {
          summary[row.status].count = Number(row.count);
          summary[row.status].totalAmount = Number(row.totalAmount);
          summary.total += Number(row.count);
        }
      }

      return summary;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getDashboardSummary(client = null) {
    const db = client || pool;
    try {
      const kpisRes = await db.query(
        `WITH today_wib AS (
           SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS today_d,
                  (now() AT TIME ZONE 'Asia/Jakarta') AS now_tz
         )
         SELECT
           (SELECT COUNT(*)::int FROM bookings, today_wib WHERE start_date = today_d AND status = 'confirmed') AS "todayPickups",
           (SELECT COUNT(*)::int FROM bookings, today_wib WHERE end_date = today_d AND status = 'active') AS "todayReturns",
           (SELECT COUNT(*)::int FROM bookings WHERE status = 'active') AS "activeRentals",
           (SELECT COUNT(*)::int FROM bookings WHERE status = 'pending') AS "pendingPayment",
           (SELECT COUNT(*)::int FROM user_documents WHERE status = 'pending') AS "pendingDocuments",
           (SELECT COUNT(*)::int FROM bookings b, today_wib
            WHERE b.status = 'active'
              AND (b.end_date < today_wib.today_d
                   OR (b.end_date = today_wib.today_d AND b.pickup_time < today_wib.now_tz::time))) AS "overdueRentals"`
      );

      const kpis = kpisRes.rows[0];

      // Pendapatan bulan ini vs bulan lalu (Single source of truth)
      const revRes = await db.query(
        `WITH months AS (
           SELECT
             to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS cur_month,
             to_char((now() AT TIME ZONE 'Asia/Jakarta') - interval '1 month', 'YYYY-MM') AS prev_month
         ),
         monthly_data AS (
           SELECT
             to_char(COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS ym,
             SUM(GREATEST(0, b.subtotal - b.refund_amount))::int AS motor_rental_rev,
             SUM(COALESCE(b.addons_total, 0) + COALESCE(b.delivery_total, 0) + COALESCE(br.late_fee, 0) + COALESCE(br.damage_fee, 0) + COALESCE(br.other_fee, 0))::int AS other_rev,
             SUM(b.rental_total - b.refund_amount + COALESCE(br.late_fee, 0) + COALESCE(br.damage_fee, 0) + COALESCE(br.other_fee, 0))::int AS net_rev
           FROM bookings b
           LEFT JOIN booking_returns br ON br.booking_id = b.id
           WHERE b.status IN ('confirmed', 'active', 'completed')
             AND (COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta') >= (now() AT TIME ZONE 'Asia/Jakarta') - interval '2 months'
           GROUP BY ym
         )
         SELECT
           COALESCE((SELECT net_rev FROM monthly_data, months WHERE ym = cur_month), 0)::int AS "monthlyRevenue",
           COALESCE((SELECT motor_rental_rev FROM monthly_data, months WHERE ym = cur_month), 0)::int AS "monthlyMotorRentalRevenue",
           COALESCE((SELECT other_rev FROM monthly_data, months WHERE ym = cur_month), 0)::int AS "monthlyOtherRevenue",
           COALESCE((SELECT net_rev FROM monthly_data, months WHERE ym = prev_month), 0)::int AS "prevMonthRevenue",
           COALESCE((SELECT motor_rental_rev FROM monthly_data, months WHERE ym = prev_month), 0)::int AS "prevMonthMotorRentalRevenue",
           COALESCE((SELECT other_rev FROM monthly_data, months WHERE ym = prev_month), 0)::int AS "prevMonthOtherRevenue"`
      );

      const monthlyRevenue = revRes.rows[0].monthlyRevenue;
      const prevMonthRevenue = revRes.rows[0].prevMonthRevenue;
      let revenueGrowthPercent = 0;
      if (prevMonthRevenue > 0) {
        revenueGrowthPercent = Math.round(((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 1000) / 10;
      } else if (monthlyRevenue > 0) {
        revenueGrowthPercent = 100;
      }

      // Okupansi 30 hari terakhir
      const occRes = await db.query(
        `WITH active_motors_count AS (
           SELECT GREATEST(1, COUNT(*)::int) AS cnt FROM motorcycles WHERE status IN ('active', 'available', 'maintenance')
         ),
         past_30 AS (
           SELECT
             (now() AT TIME ZONE 'Asia/Jakarta')::date - 30 AS start_30,
             (now() AT TIME ZONE 'Asia/Jakarta')::date AS today_d
         ),
         rented_days AS (
           SELECT
             COALESCE(SUM(
               GREATEST(0,
                 LEAST(b.end_date, past_30.today_d) - GREATEST(b.start_date, past_30.start_30)
               )
             ), 0)::int AS total_days
           FROM bookings b, past_30
           WHERE b.status IN ('confirmed', 'active', 'completed')
             AND b.end_date >= past_30.start_30
             AND b.start_date <= past_30.today_d
         )
         SELECT
           rd.total_days,
           amc.cnt,
           LEAST(100, ROUND((rd.total_days::numeric / (amc.cnt * 30)) * 1000) / 10)::numeric AS rate
         FROM rented_days rd, active_motors_count amc`
      );

      const occupancyRate30Days = Number(occRes.rows[0]?.rate || 0);

      return {
        ...kpis,
        monthlyRevenue,
        monthlyMotorRentalRevenue: revRes.rows[0].monthlyMotorRentalRevenue || 0,
        monthlyOtherRevenue: revRes.rows[0].monthlyOtherRevenue || 0,
        prevMonthRevenue,
        revenueGrowthPercent,
        occupancyRate30Days,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = reportRepo;
