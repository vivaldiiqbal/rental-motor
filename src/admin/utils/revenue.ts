/**
 * Utilitas Kalkulasi Pendapatan RodaKita (Single Source of Truth)
 *
 * Aturan Bisnis PRD v2.0 & Prompt Specification:
 * 1. Hanya menghitung transaksi berstatus valid: 'confirmed', 'active', 'completed'.
 * 2. Pendapatan Sewa Motor (motorRentalRevenue): Tarif sewa motor pokok dikurangi refund_amount.
 * 3. Pendapatan Lainnya (otherRevenue): Total layanan tambahan (add-ons), denda keterlambatan, biaya kerusakan, biaya lain-lain, dan ongkir pengantaran jika ada.
 * 4. Total Pendapatan Bersih (totalNetRevenue): motorRentalRevenue + otherRevenue.
 * 5. Uang Deposit (deposit / deposit_amount): MUTLAK TIDAK ikut dihitung sebagai pendapatan (dana titipan jaminan).
 */

export interface BookingRevenueItem {
  motorRentalRevenue: number;
  otherRevenue: number;
  totalNetRevenue: number;
}

export interface RevenueSummary {
  motorRentalRevenue: number;
  otherRevenue: number;
  totalNetRevenue: number;
}

/**
 * Menghitung pendapatan untuk satu pemesanan (booking).
 */
export function calculateBookingRevenue(b: any): BookingRevenueItem {
  if (!b || !['confirmed', 'active', 'completed'].includes(b.status)) {
    return {
      motorRentalRevenue: 0,
      otherRevenue: 0,
      totalNetRevenue: 0,
    };
  }

  // 1. Layanan tambahan & biaya opsional
  const addOns = Number(b.addOnsTotal ?? b.addonsTotal ?? 0);
  const delivery = Number(b.deliveryTotal ?? b.deliveryFee ?? 0);
  const late = Number(b.lateFee ?? b.returnInfo?.lateFee ?? 0);
  const damage = Number(b.damageFee ?? b.returnInfo?.damageFee ?? 0);
  const other = Number(b.otherFee ?? b.returnInfo?.otherFee ?? 0);

  // 2. Tarif sewa pokok motor
  const rawSubtotal =
    b.subtotal !== undefined && b.subtotal !== null
      ? Number(b.subtotal)
      : Math.max(0, Number(b.rentalTotal ?? b.totalPrice ?? b.total ?? 0) - addOns - delivery);

  const refund = Number(b.refundAmount || 0);

  // Pendapatan Sewa Motor: Tarif pokok dikurangi refund
  const motorRentalRevenue = Math.max(0, rawSubtotal - refund);

  // Pendapatan Lainnya: Add-ons + denda + kerusakan + biaya lain (+ delivery jika ada)
  const otherRevenue = Math.max(0, addOns + late + damage + other + delivery);

  // Total Pendapatan Bersih (Uang deposit jaminan 100% tidak dihitung)
  const totalNetRevenue = motorRentalRevenue + otherRevenue;

  return {
    motorRentalRevenue,
    otherRevenue,
    totalNetRevenue,
  };
}

/**
 * Menghitung akumulasi pendapatan dari daftar pemesanan (bookings).
 */
export function calculateRevenueSummary(bookings: any[]): RevenueSummary {
  return (bookings || []).reduce(
    (acc, b) => {
      const item = calculateBookingRevenue(b);
      acc.motorRentalRevenue += item.motorRentalRevenue;
      acc.otherRevenue += item.otherRevenue;
      acc.totalNetRevenue += item.totalNetRevenue;
      return acc;
    },
    { motorRentalRevenue: 0, otherRevenue: 0, totalNetRevenue: 0 }
  );
}

/**
 * Menghitung persentase pertumbuhan pendapatan dinamis (% vs bln lalu).
 *
 * Aturan:
 * - Jika bulan lalu = 0 dan bulan ini > 0 -> +100% vs bln lalu.
 * - Jika bulan lalu = 0 dan bulan ini = 0 -> 0% vs bln lalu.
 * - Selain itu: (((bulanIni - bulanLalu) / bulanLalu) * 100).toFixed(1)
 */
export function formatGrowthPercentage(
  currentMonth: number,
  prevMonth: number
): {
  text: string;
  isPositive: boolean;
  value: number;
} {
  const cur = Number(currentMonth) || 0;
  const prev = Number(prevMonth) || 0;

  if (prev === 0 && cur > 0) {
    return {
      text: '+100% vs bln lalu',
      isPositive: true,
      value: 100,
    };
  }

  if (prev === 0 && cur === 0) {
    return {
      text: '0% vs bln lalu',
      isPositive: true,
      value: 0,
    };
  }

  const diffPercent = ((cur - prev) / prev) * 100;
  const fixed = Number(diffPercent.toFixed(1));
  const sign = fixed > 0 ? '+' : '';

  return {
    text: `${sign}${fixed}% vs bln lalu`,
    isPositive: fixed >= 0,
    value: fixed,
  };
}

/**
 * Formatter adaptif sumbu Y grafik pendapatan Recharts.
 *
 * Aturan:
 * - Nilai 0 -> Rp 0
 * - Nilai < 1.000.000 -> format ribuan (mis. Rp 50rb, Rp 100rb)
 * - Nilai >= 1.000.000 -> format jutaan, maksimal 1 desimal jika tidak bulat (mis. Rp 1.5jt, Rp 2jt)
 */
export function formatYAxisRevenue(value: number): string {
  const v = Math.round(Number(value) || 0);
  if (v <= 0) return 'Rp 0';

  if (v < 1_000_000) {
    const rb = Math.round(v / 1_000);
    return `Rp ${rb}rb`;
  }

  const jt = v / 1_000_000;
  const formattedJt = jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1);
  return `Rp ${formattedJt}jt`;
}

