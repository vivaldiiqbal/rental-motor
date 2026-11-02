const pricingService = require('../../src/services/pricingService');

describe('Unit Test: Dynamic Pricing Engine & Discount Tiers', () => {
  const basePricePerDay = 100000;

  describe('1. Discount Tiers (Durasi Sewa)', () => {
    const testTiers = [
      { id: 1, minDays: 3, discountPercent: 5.0, isActive: true },
      { id: 2, minDays: 7, discountPercent: 10.0, isActive: true },
      { id: 3, minDays: 30, discountPercent: 20.0, isActive: true },
    ];

    test('Sewa 1 - 2 hari tidak mendapatkan diskon durasi', () => {
      const res = pricingService.calculatePriceInternal(
        { pricePerDay: basePricePerDay, days: 2 },
        { rules: [], tiers: testTiers },
      );
      expect(res.durationDiscount).toBe(0);
      expect(res.durationDiscountPercent).toBe(0);
      expect(res.totalRental).toBe(200000);
    });

    test('Sewa 3 - 6 hari mendapatkan diskon 5%', () => {
      const res = pricingService.calculatePriceInternal(
        { pricePerDay: basePricePerDay, days: 4 },
        { rules: [], tiers: testTiers },
      );
      // Subtotal = 400.000, Diskon 5% = 20.000
      expect(res.durationDiscountPercent).toBe(5);
      expect(res.durationDiscount).toBe(20000);
      expect(res.totalRental).toBe(380000);
    });

    test('Sewa 7 - 29 hari mendapatkan diskon 10%', () => {
      const res = pricingService.calculatePriceInternal(
        { pricePerDay: basePricePerDay, days: 7 },
        { rules: [], tiers: testTiers },
      );
      // Subtotal = 700.000, Diskon 10% = 70.000
      expect(res.durationDiscountPercent).toBe(10);
      expect(res.durationDiscount).toBe(70000);
      expect(res.totalRental).toBe(630000);
    });

    test('Sewa 30 hari mendapatkan tier tertinggi 20%', () => {
      const res = pricingService.calculatePriceInternal(
        { pricePerDay: basePricePerDay, days: 30 },
        { rules: [], tiers: testTiers },
      );
      // Subtotal = 3.000.000, Diskon 20% = 600.000
      expect(res.durationDiscountPercent).toBe(20);
      expect(res.durationDiscount).toBe(600000);
      expect(res.totalRental).toBe(2400000);
    });

    test('Tier yang non-aktif (isActive = false) diabaikan', () => {
      const inactiveTiers = [
        { id: 1, minDays: 3, discountPercent: 5.0, isActive: false },
        { id: 2, minDays: 7, discountPercent: 10.0, isActive: true },
      ];
      const res = pricingService.calculatePriceInternal(
        { pricePerDay: basePricePerDay, days: 3 },
        { rules: [], tiers: inactiveTiers },
      );
      expect(res.durationDiscount).toBe(0);
    });
  });

  describe('2. Pricing Rules: Weekend, Seasonal, Rate Types & Scope', () => {
    test('Weekend Surcharge persentase: menambah biaya pada hari Sabtu dan Minggu', () => {
      const weekendRule = {
        id: 101,
        name: 'Surcharge Weekend 10%',
        ruleType: 'weekend',
        rateType: 'percentage',
        rateValue: 10.0,
        scope: 'all',
        isActive: true,
        priority: 10,
      };

      // Jumat 2026-10-23 s/d Senin 2026-10-26 (3 hari: Jumat, Sabtu, Minggu)
      // Sabtu & Minggu = 2 hari akhir pekan
      const res = pricingService.calculatePriceInternal(
        {
          pricePerDay: basePricePerDay,
          days: 3,
          startDate: '2026-10-23',
          endDate: '2026-10-26',
        },
        { rules: [weekendRule], tiers: [] },
      );

      // Subtotal 300.000 + 2 x 10.000 = 320.000
      expect(res.weekendDays).toBe(2);
      expect(res.weekendSurcharge).toBe(20000);
      expect(res.totalSurcharge).toBe(20000);
      expect(res.totalRental).toBe(320000);
      expect(res.lineItems.some((li) => li.kind === 'surcharge' && li.amount === 20000)).toBe(true);
    });

    test('Seasonal Surcharge dengan fixed nominal per hari pada jendela tanggal tertentu', () => {
      const holidayRule = {
        id: 201,
        name: 'Peak Season Liburan',
        ruleType: 'seasonal',
        rateType: 'fixed',
        rateValue: 35000,
        scope: 'all',
        startDate: '2026-12-24',
        endDate: '2026-12-26',
        isActive: true,
        priority: 20,
      };

      // Sewa 23 Des s/d 28 Des (5 hari)
      // Hari yang kena seasonal: 24, 25, 26 (3 hari)
      const res = pricingService.calculatePriceInternal(
        {
          pricePerDay: basePricePerDay,
          days: 5,
          startDate: '2026-12-23',
          endDate: '2026-12-28',
        },
        { rules: [holidayRule], tiers: [] },
      );

      expect(res.totalSurcharge).toBe(3 * 35000); // 105.000
      expect(res.totalRental).toBe(500000 + 105000);
      const scItem = res.lineItems.find((li) => li.ruleId === 201);
      expect(scItem).toBeDefined();
      expect(scItem.amount).toBe(105000);
    });

    test('Scope motor_type: hanya berlaku untuk jenis motor tertentu', () => {
      const sportRule = {
        id: 301,
        name: 'Surcharge Motor Sport Akhir Pekan',
        ruleType: 'weekend',
        rateType: 'percentage',
        rateValue: 20.0,
        scope: 'motor_type',
        targetMotorType: 'sport',
        isActive: true,
        priority: 15,
      };

      // Sewa motor matic di akhir pekan -> tidak kena
      const resMatic = pricingService.calculatePriceInternal(
        {
          pricePerDay: basePricePerDay,
          days: 2,
          startDate: '2026-10-24', // Sabtu
          endDate: '2026-10-26',   // Senin (2 hari weekend)
          motorType: 'matic',
        },
        { rules: [sportRule], tiers: [] },
      );
      expect(resMatic.totalSurcharge).toBe(0);

      // Sewa motor sport di akhir pekan -> kena 20%
      const resSport = pricingService.calculatePriceInternal(
        {
          pricePerDay: basePricePerDay,
          days: 2,
          startDate: '2026-10-24',
          endDate: '2026-10-26',
          motorType: 'sport',
        },
        { rules: [sportRule], tiers: [] },
      );
      expect(resSport.totalSurcharge).toBe(40000); // 2 hari x 20.000
    });

    test('Scope motorcycle: hanya berlaku untuk unit motor spesifik', () => {
      const specificRule = {
        id: 401,
        name: 'Unit Premium Special Fee',
        ruleType: 'custom',
        rateType: 'fixed',
        rateValue: 50000,
        scope: 'motorcycle',
        targetMotorcycleId: 99,
        isActive: true,
        priority: 30,
      };

      const resDifferent = pricingService.calculatePriceInternal(
        { pricePerDay: basePricePerDay, days: 1, startDate: '2026-11-01', endDate: '2026-11-02', motorId: 88 },
        { rules: [specificRule], tiers: [] },
      );
      expect(resDifferent.totalSurcharge).toBe(0);

      const resMatch = pricingService.calculatePriceInternal(
        { pricePerDay: basePricePerDay, days: 1, startDate: '2026-11-01', endDate: '2026-11-02', motorId: 99 },
        { rules: [specificRule], tiers: [] },
      );
      expect(resMatch.totalSurcharge).toBe(50000);
    });

    test('Rate type multiplier: pengali harga (misal 1.25x = +25%)', () => {
      const multiplierRule = {
        id: 501,
        name: 'Pengali Musim Libur 1.25x',
        ruleType: 'seasonal',
        rateType: 'multiplier',
        rateValue: 1.25,
        scope: 'all',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        isActive: true,
        priority: 10,
      };

      const res = pricingService.calculatePriceInternal(
        {
          pricePerDay: 120000,
          days: 2,
          startDate: '2026-07-01',
          endDate: '2026-07-03', // 2 hari
        },
        { rules: [multiplierRule], tiers: [] },
      );

      // Extra per hari = 120.000 * 0.25 = 30.000
      // 2 hari = 60.000
      expect(res.totalSurcharge).toBe(60000);
    });
  });

  describe('3. Kombinasi Surcharge, Diskon Durasi, Addons, Promo, Deposit & Snapshot', () => {
    test('Kalkulasi terintegrasi menghasilkan snapshot lineItems yang lengkap dan akurat', () => {
      const rules = [
        {
          id: 10,
          name: 'Weekend +10%',
          ruleType: 'weekend',
          rateType: 'percentage',
          rateValue: 10,
          scope: 'all',
          isActive: true,
        },
      ];
      const tiers = [
        { id: 1, minDays: 3, discountPercent: 5.0, isActive: true },
      ];

      const res = pricingService.calculatePriceInternal(
        {
          pricePerDay: 100000,
          days: 3,
          startDate: '2026-10-23', // Jumat
          endDate: '2026-10-26',   // Senin (2 hari weekend: Sab, Min)
          discount: 25000,
          promoCode: 'DISKONHEMAT',
          deposit: 200000,
        },
        { rules, tiers },
      );

      // Subtotal: 300.000
      // Weekend: +20.000
      // Diskon durasi 3 hari (5% dari 300.000): -15.000
      // Promo diskon: -25.000
      // Total sewa: 300.000 + 20.000 - 15.000 - 25.000 = 280.000
      // Deposit: 200.000
      // Grand Total: 480.000
      expect(res.subtotal).toBe(300000);
      expect(res.weekendSurcharge).toBe(20000);
      expect(res.durationDiscount).toBe(15000);
      expect(res.promoDiscount).toBe(25000);
      expect(res.totalRental).toBe(280000);
      expect(res.deposit).toBe(200000);
      expect(res.total).toBe(480000);

      // Snapshot checks
      expect(res.snapshot).toBeDefined();
      expect(res.snapshot.appliedRules.length).toBe(1);
      expect(res.snapshot.appliedRules[0].name).toBe('Weekend +10%');
      expect(res.snapshot.appliedTier.discountPercent).toBe(5);
      expect(res.snapshot.lineItems.length).toBeGreaterThanOrEqual(4);
    });
  });
});
