const pricingService = require('../../src/services/pricingService');
const { RENTAL_RULES } = require('../../src/config/rules');

describe('Unit Test: Pricing Service (Business Rules)', () => {
  test('Menghitung subtotal sewa standar dengan diskon durasi dan deposit', () => {
    // 3 hari sewa -> kena diskon durasi 5%
    const result = pricingService.calculatePrice({
      pricePerDay: 100000,
      days: 3,
      pickupMethod: 'store',
      addOnIds: [],
      discount: 0,
      deposit: 200000,
    });

    expect(result.subtotal).toBe(300000); // 100.000 * 3
    expect(result.durationDiscountPercent).toBe(5);
    expect(result.durationDiscount).toBe(15000); // 5% dari 300.000
    expect(result.totalRental).toBe(285000); // 300.000 - 15.000
    expect(result.deliveryFee).toBe(0);
    expect(result.addOnsTotal).toBe(0);
    expect(result.deposit).toBe(200000);
    // total = totalRental (285.000) + deposit (200.000) = 485.000
    expect(result.total).toBe(485000);
    expect(result.lineItems).toBeInstanceOf(Array);
    expect(result.lineItems.length).toBeGreaterThan(0);
  });

  test('Menghitung diskon durasi 10% untuk sewa 7 hari atau lebih', () => {
    const result = pricingService.calculatePrice({
      pricePerDay: 100000,
      days: 7,
      deposit: 200000,
    });

    expect(result.subtotal).toBe(700000);
    expect(result.durationDiscountPercent).toBe(10);
    expect(result.durationDiscount).toBe(70000); // 10% dari 700.000
    expect(result.totalRental).toBe(630000);
    expect(result.total).toBe(630000 + 200000);
  });

  test('Menghitung biaya antar-jemput delivery (2 arah = Rp 50.000)', () => {
    const result = pricingService.calculatePrice({
      pricePerDay: 80000,
      days: 2, // < 3 hari, diskon durasi 0%
      pickupMethod: 'delivery',
      addOnIds: [],
      deposit: 200000,
    });

    expect(result.subtotal).toBe(160000);
    expect(result.durationDiscount).toBe(0);
    expect(result.deliveryFee).toBe(RENTAL_RULES.deliveryFeePerTrip * 2); // 50.000
    // total = sewa (160.000) + delivery (50.000) + deposit (200.000) = 410.000
    expect(result.total).toBe(410000);
  });

  test('Menghitung biaya add-on (helm tambahan & jas hujan)', () => {
    const result = pricingService.calculatePrice({
      pricePerDay: 100000,
      days: 2,
      pickupMethod: 'store',
      addOnIds: ['extra_helmet', 'raincoat'], // 10.000 + 5.000 per hari = 15.000/hari * 2 hari = 30.000
      deposit: 200000,
    });

    expect(result.addOnsTotal).toBe(30000);
    expect(result.selectedAddOns).toHaveLength(2);
    // total = 200.000 (sewa) + 30.000 (addon) + 200.000 (deposit) = 430.000
    expect(result.total).toBe(430000);
  });

  test('Menerapkan diskon promo dan memastikan total sewa tidak pernah negatif', () => {
    const result = pricingService.calculatePrice({
      pricePerDay: 50000,
      days: 1,
      pickupMethod: 'store',
      discount: 100000, // Diskon lebih besar dari subtotal sewa
      deposit: 200000,
    });

    expect(result.discount).toBe(50000); // Dibatasi maksimal subtotal sewa
    expect(result.totalRental).toBe(0);
    expect(result.total).toBe(200000); // Hanya tersisa deposit jaminan
  });

  test('Menerapkan weekend surcharge 10% jika WEEKEND_SURCHARGE aktif di hari Sabtu/Minggu', () => {
    const env = require('../../src/config/env');
    const prev = env.WEEKEND_SURCHARGE;
    env.WEEKEND_SURCHARGE = true;

    // 2026-10-24 adalah Sabtu, 2026-10-26 adalah Senin (2 hari sewa: Sabtu & Minggu, keduanya weekend)
    const result = pricingService.calculatePrice({
      pricePerDay: 100000,
      days: 2,
      startDate: '2026-10-24',
      endDate: '2026-10-26',
      deposit: 200000,
    });

    expect(result.weekendDays).toBe(2);
    expect(result.weekendSurcharge).toBe(20000); // 10% per hari weekend = 10.000 * 2 = 20.000
    expect(result.subtotal).toBe(200000);

    env.WEEKEND_SURCHARGE = prev;
  });

  test('Pembulatan integer money: Memastikan nominal harga selalu bilangan bulat', () => {
    const result = pricingService.calculatePrice({
      pricePerDay: 75555.55,
      days: 3,
      deposit: 199999.9,
    });

    expect(Number.isInteger(result.subtotal)).toBe(true);
    expect(Number.isInteger(result.durationDiscount)).toBe(true);
    expect(Number.isInteger(result.total)).toBe(true);
    expect(Number.isInteger(result.deposit)).toBe(true);
  });
});

