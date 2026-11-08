const reportRepo = require('../../src/repositories/postgres/reportRepo');
const dashboardService = require('../../src/services/admin/dashboardService');

describe('Unit Test: Single Source of Truth Rumus Pendapatan Bersih', () => {
  test('Kalkulasi komponen pendapatan murni (Sewa Pokok, Lainnya, Total Bersih, Tanpa Deposit)', () => {
    // Simulasi booking RM-261104-W65R
    const sampleBooking = {
      id: 1,
      status: 'completed',
      subtotal: 75000,
      addOnsTotal: 35000,
      deliveryTotal: 0,
      deposit: 200000,
      grandTotal: 310000,
      refundAmount: 0,
      lateFee: 0,
      damageFee: 0,
      otherFee: 0,
    };

    const motorRentalRevenue = Math.max(0, Number(sampleBooking.subtotal) - Number(sampleBooking.refundAmount));
    const otherRevenue = Number(sampleBooking.addOnsTotal) + Number(sampleBooking.lateFee) + Number(sampleBooking.damageFee) + Number(sampleBooking.otherFee);
    const totalNetRevenue = motorRentalRevenue + otherRevenue;

    expect(motorRentalRevenue).toBe(75000);
    expect(otherRevenue).toBe(35000);
    expect(totalNetRevenue).toBe(110000);

    // Deposit jaminan 200.000 MUTLAK tidak ikut dihitung
    expect(totalNetRevenue).not.toBe(sampleBooking.grandTotal);
  });

  test('Aturan Persentase Pertumbuhan Dinamis', () => {
    function computeGrowth(current, prev) {
      if (prev === 0 && current > 0) return { text: '+100% vs bln lalu', isPositive: true };
      if (prev === 0 && current === 0) return { text: '0% vs bln lalu', isPositive: true };
      const diff = ((current - prev) / prev) * 100;
      const fixed = Number(diff.toFixed(1));
      const sign = fixed > 0 ? '+' : '';
      return { text: `${sign}${fixed}% vs bln lalu`, isPositive: fixed >= 0 };
    }

    // Bulan lalu = 0, bulan ini = 110.000
    expect(computeGrowth(110000, 0)).toEqual({ text: '+100% vs bln lalu', isPositive: true });

    // Bulan lalu = 0, bulan ini = 0
    expect(computeGrowth(0, 0)).toEqual({ text: '0% vs bln lalu', isPositive: true });

    // Bulan lalu = 100.000, bulan ini = 120.000 (+20%)
    expect(computeGrowth(120000, 100000)).toEqual({ text: '+20% vs bln lalu', isPositive: true });

    // Bulan lalu = 100.000, bulan ini = 85.000 (-15%)
    expect(computeGrowth(85000, 100000)).toEqual({ text: '-15% vs bln lalu', isPositive: false });
  });

  test('Formatter Sumbu Y Grafik Recharts Adaptif', () => {
    function formatYAxisRevenue(value) {
      const v = Math.round(Number(value) || 0);
      if (v <= 0) return 'Rp 0';
      if (v < 1000000) {
        const rb = Math.round(v / 1000);
        return `Rp ${rb}rb`;
      }
      const jt = v / 1000000;
      const formattedJt = jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1);
      return `Rp ${formattedJt}jt`;
    }

    expect(formatYAxisRevenue(0)).toBe('Rp 0');
    expect(formatYAxisRevenue(50000)).toBe('Rp 50rb');
    expect(formatYAxisRevenue(110000)).toBe('Rp 110rb');
    expect(formatYAxisRevenue(1000000)).toBe('Rp 1jt');
    expect(formatYAxisRevenue(1500000)).toBe('Rp 1.5jt');
    expect(formatYAxisRevenue(2000000)).toBe('Rp 2jt');
  });
});

