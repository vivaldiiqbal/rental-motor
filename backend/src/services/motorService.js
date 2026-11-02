const { motorRepo, reviewRepo, favoriteRepo, store } = require('../repositories');
const availabilityService = require('./availabilityService');
const settingsService = require('./admin/settingsService');
const { RENTAL_RULES } = require('../config/rules');
const { MOTOR_STATUS } = require('../config/constants');
const AppError = require('../utils/AppError');
const { countDays } = require('../utils/dates');
const { sanitizeMotor, sanitizeMotors } = require('../utils/sanitize');

class MotorService {
  /**
   * Katalog motor publik: filter, pencarian, ketersediaan, estimasi total harga, dan status favorit.
   */
  async getMotorcycles(query = {}, user = null) {
    const {
      start,
      end,
      type,
      brand,
      transmission,
      minPrice = 0,
      maxPrice = 0,
      minRating = 0,
      availableOnly = false,
      sort = 'price_asc',
      search = '',
      page = 1,
      limit = 12,
    } = query;

    // Validasi rentang harga aneh
    const safeMinPrice = Math.max(0, parseInt(minPrice, 10) || 0);
    const safeMaxPrice = Math.max(0, parseInt(maxPrice, 10) || 0);
    if (safeMinPrice > 0 && safeMaxPrice > 0 && safeMinPrice > safeMaxPrice) {
      throw new AppError('Filter harga tidak valid: minPrice tidak boleh lebih besar dari maxPrice.', 'VALIDATION_ERROR', 400);
    }

    // Normalisasi parameter koma
    const types = type ? (Array.isArray(type) ? type : type.split(',').map((s) => s.trim())) : [];
    const brands = brand ? (Array.isArray(brand) ? brand : brand.split(',').map((s) => s.trim())) : [];

    // Ambil motor yang hanya berstatus 'available' (motor maintenance/inactive dilarang tampil di publik)
    let allMotors = [];
    if (process.env.USE_DB === 'postgres') {
      const res = await motorRepo.findAll({ status: MOTOR_STATUS.AVAILABLE }, { limit: 1000 });
      allMotors = res.items;
    } else {
      allMotors = store
        .getCollection('motors')
        .filter((m) => m.status === MOTOR_STATUS.AVAILABLE)
        .map((m) => ({ ...m }));
    }

    // Hitung durasi hari sewa jika ada tanggal
    const days = start && end ? countDays(start, end) : 0;

    // Ambil set favorit milik user yang login
    let userFavSet = new Set();
    if (user && user.id) {
      const userFavs = await favoriteRepo.findByUserId(user.id);
      userFavSet = new Set(userFavs.map((f) => Number(f.motorId)));
    }

    // Filter data di memori
    let filtered = allMotors.filter((m) => {
      // Pencarian teks
      if (search) {
        const q = search.trim().toLowerCase();
        if (!`${m.name} ${m.brand} ${m.type} ${m.description || ''}`.toLowerCase().includes(q)) {
          return false;
        }
      }

      // Filter multi tipe
      if (types.length > 0 && !types.includes(m.type)) {
        return false;
      }

      // Filter multi merek
      if (brands.length > 0 && !brands.includes(m.brand)) {
        return false;
      }

      // Transmisi
      if (transmission && m.transmission.toLowerCase() !== transmission.toLowerCase()) {
        return false;
      }

      // Rentang harga
      if (minPrice > 0 && m.pricePerDay < minPrice) return false;
      if (maxPrice > 0 && m.pricePerDay > maxPrice) return false;

      // Rating minimal
      if (minRating > 0 && (m.rating || 0) < minRating) return false;

      return true;
    });

    // Tempelkan ketersediaan, estimasi harga, dan status isFavorite
    let processed = await Promise.all(
      filtered.map(async (m) => {
        let isFree = true;
        if (start && end) {
          isFree = await availabilityService.isMotorAvailable(m.id, start, end);
        }

        const estimatedTotal = days > 0 ? m.pricePerDay * days : undefined;
        const clean = sanitizeMotor(m);

        return {
          id: clean.id,
          slug: clean.slug,
          name: clean.name,
          brand: clean.brand,
          type: clean.type,
          cc: clean.cc,
          year: clean.year,
          transmission: clean.transmission,
          pricePerDay: clean.pricePerDay,
          deposit: clean.deposit,
          image: clean.images && clean.images.length > 0 ? clean.images[0] : null,
          images: clean.images || [],
          ratingAvg: clean.rating || 5.0,
          reviewCount: clean.reviewCount || 0,
          available: isFree,
          ...(estimatedTotal !== undefined && { estimatedTotal }),
          isFavorite: userFavSet.has(Number(clean.id)),
        };
      }),
    );

    // Filter availableOnly jika diminta
    if (availableOnly) {
      processed = processed.filter((m) => m.available);
    }

    // Urutkan (Sorting) dengan toleransi input
    const sorters = {
      price_asc: (a, b) => a.pricePerDay - b.pricePerDay,
      'price-asc': (a, b) => a.pricePerDay - b.pricePerDay,
      price_desc: (a, b) => b.pricePerDay - a.pricePerDay,
      'price-desc': (a, b) => b.pricePerDay - a.pricePerDay,
      rating: (a, b) => b.ratingAvg - a.ratingAvg,
      newest: (a, b) => b.year - a.year,
      popular: (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0),
    };
    const sorterFn = sorters[sort] || sorters.price_asc;
    processed.sort(sorterFn);

    const total = processed.length;
    const numericLimit = parseInt(limit, 10);
    const safeLimit = Math.min(50, Math.max(1, isNaN(numericLimit) ? 12 : numericLimit));
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const numericPage = parseInt(page, 10);
    const safePage = Math.min(Math.max(1, isNaN(numericPage) ? 1 : numericPage), totalPages);
    const offset = (safePage - 1) * safeLimit;
    const items = processed.slice(offset, offset + safeLimit);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
    };
  }

  /**
   * Mengambil metadata filter (merek, tipe, transmisi, rentang harga).
   */
  async getFilters() {
    let motors = [];
    if (process.env.USE_DB === 'postgres') {
      const res = await motorRepo.findAll({ status: MOTOR_STATUS.AVAILABLE }, { limit: 1000 });
      motors = res.items;
    } else {
      motors = store.getCollection('motors').filter((m) => m.status === MOTOR_STATUS.AVAILABLE);
    }

    const brands = [...new Set(motors.map((m) => m.brand))].sort();
    const types = [...new Set(motors.map((m) => m.type))].sort();
    const transmissions = [...new Set(motors.map((m) => m.transmission))].sort();
    const prices = motors.map((m) => m.pricePerDay);

    return {
      brands,
      types,
      transmissions,
      price: {
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      },
    };
  }

  /**
   * Detail motor lengkap (id atau slug).
   */
  async getMotorDetail(idOrSlug, user = null) {
    const isNum = /^\d+$/.test(idOrSlug);
    let motor = null;
    let reviews = [];

    if (process.env.USE_DB === 'postgres') {
      motor = isNum ? await motorRepo.findById(idOrSlug) : await motorRepo.findBySlug(idOrSlug);
      if (motor) {
        const rRes = await reviewRepo.findByMotorId(motor.id, { limit: 1000 });
        reviews = rRes.items;
      }
    } else {
      const motors = store.getCollection('motors');
      motor = motors.find((m) => (isNum ? Number(m.id) === Number(idOrSlug) : m.slug === idOrSlug));
      if (motor) {
        reviews = store.getCollection('reviews').filter((r) => Number(r.motorId) === Number(motor.id));
      }
    }

    if (!motor || motor.status !== MOTOR_STATUS.AVAILABLE) {
      throw new AppError('Motor tidak ditemukan.', 'NOT_FOUND', 404);
    }

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)));
      ratingDistribution[star] = (ratingDistribution[star] || 0) + 1;
    });

    const isFav = user && user.id ? await favoriteRepo.isFavorite(user.id, motor.id) : false;
    const clean = sanitizeMotor(motor);

    return {
      ...clean,
      image: clean.images && clean.images[0] ? clean.images[0] : null,
      ratingAvg: clean.rating || 5.0,
      ratingDistribution,
      rentalRules: {
        minDays: RENTAL_RULES.minDays,
        maxDays: RENTAL_RULES.maxDays,
        operationalHours: RENTAL_RULES.operationalHours,
        defaultDeposit: clean.deposit || RENTAL_RULES.defaultDeposit,
        lateFeePercentPerHour: RENTAL_RULES.lateFeePercentPerHour,
        deliveryFeePerTrip: RENTAL_RULES.deliveryFeePerTrip,
      },
      isFavorite: isFav,
    };
  }

  async getFeatured(limit = 6, user = null) {
    let motors = [];
    if (process.env.USE_DB === 'postgres') {
      motors = await motorRepo.findFeatured(limit);
    } else {
      motors = store
        .getCollection('motors')
        .filter((m) => m.status === MOTOR_STATUS.AVAILABLE)
        .sort((a, b) => (b.popularity || 0) * (b.rating || 1) - (a.popularity || 0) * (a.rating || 1))
        .slice(0, Math.min(limit, 20));
    }

    let userFavSet = new Set();
    if (user && user.id) {
      const favs = await favoriteRepo.findByUserId(user.id);
      userFavSet = new Set(favs.map((f) => Number(f.motorId)));
    }

    return motors.map((m) => {
      const clean = sanitizeMotor(m);
      return {
        id: clean.id,
        slug: clean.slug,
        name: clean.name,
        brand: clean.brand,
        type: clean.type,
        cc: clean.cc,
        year: clean.year,
        transmission: clean.transmission,
        pricePerDay: clean.pricePerDay,
        deposit: clean.deposit,
        image: clean.images && clean.images[0] ? clean.images[0] : null,
        images: clean.images || [],
        ratingAvg: clean.rating || 5.0,
        reviewCount: clean.reviewCount || 0,
        available: true,
        isFavorite: userFavSet.has(Number(clean.id)),
      };
    });
  }

  async getSimilar(motorId, limit = 4) {
    const motors = await motorRepo.findSimilar(motorId, limit);
    return sanitizeMotors(motors);
  }

  async getRentalOptions() {
    let settings = null;
    try {
      settings = await settingsService.getSettings();
    } catch (e) {
      // fallback jika database kosong / error
    }

    return {
      pickupLocations: RENTAL_RULES.pickupLocations,
      addOns: RENTAL_RULES.addOns,
      deliveryFees: {
        pickup: RENTAL_RULES.deliveryFeePerTrip,
        dropoff: RENTAL_RULES.deliveryFeePerTrip,
        roundTrip: RENTAL_RULES.deliveryFeePerTrip * 2,
      },
      rules: {
        minDays: settings?.minRentalDays ?? RENTAL_RULES.minDays,
        maxDays: settings?.maxRentalDays ?? RENTAL_RULES.maxDays,
        defaultDeposit: settings?.defaultDeposit ?? RENTAL_RULES.defaultDeposit,
        lateFeePercentPerHour: settings?.lateFeePercentPerHour ?? RENTAL_RULES.lateFeePercentPerHour,
        lateFeeToleranceMinutes: settings?.lateFeeToleranceMinutes ?? 120,
        operationalHours: settings?.operatingHours || RENTAL_RULES.operationalHours,
        minRenterAge: settings?.minRenterAge ?? 18,
        bookingExpireMinutes: settings?.bookingExpireMinutes ?? 60,
        cancellationPolicy: settings?.cancellationPolicy ?? [
          { thresholdHours: 48, refundPercent: 100 },
          { thresholdHours: 24, refundPercent: 50 },
          { thresholdHours: 0, refundPercent: 0 },
        ],
      },
    };
  }
}

module.exports = new MotorService();
