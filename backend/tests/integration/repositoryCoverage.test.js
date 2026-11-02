const { pool } = require('../../db/pool');
const { loadSeed } = require('../../db/seeds/loadSeed');
const documentRepo = require('../../src/repositories/postgres/documentRepo');
const motorRepo = require('../../src/repositories/postgres/motorRepo');
const paymentRepo = require('../../src/repositories/postgres/paymentRepo');
const promoRepo = require('../../src/repositories/postgres/promoRepo');
const bookingRepo = require('../../src/repositories/postgres/bookingRepo');
const reviewRepo = require('../../src/repositories/postgres/reviewRepo');
const userRepo = require('../../src/repositories/postgres/userRepo');

describe('Integration Test: PostgreSQL Repositories Deep Coverage', () => {
  beforeAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await loadSeed();
    }
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  }, 15000);

  // 1. Document Repository
  describe('documentRepo', () => {
    test('upsert, findByUserId, findByUserAndType, dan updateStatus', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      const userId = 1;

      // 1. Upsert dokumen KTP
      const doc = await documentRepo.upsert({
        userId,
        type: 'ktp',
        filePath: 'uploads/documents/ktp_test_cover.jpg',
        fileSize: 150000,
        mimeType: 'image/jpeg',
        status: 'pending',
      });
      expect(doc.type).toBe('ktp');
      expect(doc.status).toBe('pending');

      // 2. findByUserAndType
      const found = await documentRepo.findByUserAndType(userId, 'ktp');
      expect(found).not.toBeNull();
      expect(found.type).toBe('ktp');

      // 3. findByUserId (mengembalikan array [ktp, sim])
      const docs = await documentRepo.findByUserId(userId);
      expect(docs.length).toBe(2);

      // 4. updateStatus ke verified
      const updated = await documentRepo.updateStatus(userId, 'ktp', 'verified', 'Dokumen valid');
      expect(updated.status).toBe('verified');
      expect(updated.reviewerNote).toBe('Dokumen valid');

      // 6. findByUserIdAndType alias
      const foundByType = await documentRepo.findByUserIdAndType(userId, 'sim');
      expect(foundByType).toBeDefined();
    });
  });

  // 2. Motor Repository
  describe('motorRepo', () => {
    test('search dengan ragam filter, sorting, pagination, dan relasi gambar', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      // 1. search dengan q, minPrice, maxPrice, brands, types, transmission, sort
      const searchRes = await motorRepo.search(
        {
          q: 'Honda',
          minPrice: 50000,
          maxPrice: 300000,
          brands: ['Honda'],
          types: ['matic'],
          transmission: 'Otomatis',
          minRating: 3.5,
        },
        { page: 1, limit: 10 },
        'price_asc',
      );
      expect(searchRes).toHaveProperty('items');
      expect(searchRes).toHaveProperty('total');
      expect(Array.isArray(searchRes.items)).toBe(true);

      // 2. findSimilar
      const similar = await motorRepo.findSimilar(1, 4);
      expect(Array.isArray(similar)).toBe(true);

      // 3. getDistinctBrands
      const brands = await motorRepo.getDistinctBrands();
      expect(Array.isArray(brands)).toBe(true);
      expect(brands).toContain('Honda');

      // 4. getPriceRange
      const priceRange = await motorRepo.getPriceRange();
      expect(priceRange).toHaveProperty('min');
      expect(priceRange).toHaveProperty('max');
      expect(priceRange.max).toBeGreaterThan(priceRange.min);

      // 5. findFeatured
      const featured = await motorRepo.findFeatured(5);
      expect(featured.length).toBeLessThanOrEqual(5);

      // 6. create dan update motor
      const newMotor = await motorRepo.create({
        slug: 'honda-scoopy-cov-' + Date.now(),
        name: 'Honda Scoopy Coverage',
        brand: 'Honda',
        type: 'matic',
        cc: 110,
        year: 2024,
        color: 'Merah',
        transmission: 'Otomatis',
        pricePerDay: 85000,
        deposit: 200000,
      });
      expect(newMotor).toHaveProperty('id');

      const updatedMotor = await motorRepo.update(newMotor.id, {
        pricePerDay: 90000,
        color: 'Hitam',
      });
      expect(updatedMotor.pricePerDay).toBe(90000);
      expect(updatedMotor.color).toBe('Hitam');
    });
  });

  // 3. Payment Repository
  describe('paymentRepo', () => {
    test('create, findById, findByBookingId, dan update status payment', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      // 1. create payment
      const newPayment = await paymentRepo.create({
        bookingId: 2,
        amount: 250000,
        deposit: 200000,
        method: 'bank_transfer',
        status: 'pending',
        provider: 'simulation',
        instructions: { bank: 'BCA', va: '1234567890' },
      });
      expect(newPayment).toHaveProperty('id');
      expect(newPayment.status).toBe('pending');

      // 2. findById
      const found = await paymentRepo.findById(newPayment.id);
      expect(found).not.toBeNull();
      expect(found.id).toBe(newPayment.id);

      // 3. findByBookingId
      const byBooking = await paymentRepo.findByBookingId(2);
      expect(byBooking).not.toBeNull();
      expect(byBooking.bookingId).toBe(2);

      // 4. update
      const updated = await paymentRepo.update(newPayment.id, {
        status: 'paid',
        paidAt: new Date().toISOString(),
      });
      expect(updated.status).toBe('paid');
      expect(updated.paidAt).not.toBeNull();
    });
  });

  // 4. Promo Repository
  describe('promoRepo', () => {
    test('findByCode, findAll, decrementQuota, dan incrementQuota', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      const promo = await promoRepo.findByCode('HEMAT10');
      expect(promo).not.toBeNull();
      expect(promo.code).toBe('HEMAT10');

      const all = await promoRepo.findAll();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);

      // decrement & increment quota dengan kode promo
      const decSuccess = await promoRepo.decrementQuota('HEMAT10');
      expect(typeof decSuccess).toBe('boolean');

      const incSuccess = await promoRepo.incrementQuota('HEMAT10');
      expect(typeof incSuccess).toBe('boolean');
    });
  });

  // 5. Booking Repository Extra Coverage
  describe('bookingRepo', () => {
    test('findByUserId, countStatusByUserId, findExpiredPending, dan findBlockedRanges', async () => {
      if (process.env.USE_DB !== 'postgres') return;

      const userBookings = await bookingRepo.findByUserId(1, {}, { page: 1, limit: 10 });
      expect(userBookings).toHaveProperty('items');
      expect(userBookings).toHaveProperty('total');

      const counts = await bookingRepo.countStatusByUserId(1);
      expect(counts).toHaveProperty('all');
      expect(counts).toHaveProperty('pending');
      expect(counts).toHaveProperty('confirmed');

      const blocked = await bookingRepo.findBlockedRanges(1, '2026-10-01', '2027-04-01');
      expect(Array.isArray(blocked)).toBe(true);

      const expired = await bookingRepo.findExpiredPending(new Date().toISOString());
      expect(Array.isArray(expired)).toBe(true);
    });
  });

  // 6. Meta Repository
  describe('metaRepo', () => {
    test('getRentalOptions, getPickupLocations, dan getAddons', async () => {
      if (process.env.USE_DB !== 'postgres') return;
      const metaRepo = require('../../src/repositories/postgres/metaRepo');

      const options = metaRepo.getRentalOptions();
      expect(options).toHaveProperty('pickupLocations');
      expect(options).toHaveProperty('addOns');

      const locations = await metaRepo.getPickupLocations();
      expect(Array.isArray(locations)).toBe(true);

      const addons = await metaRepo.getAddons();
      expect(Array.isArray(addons)).toBe(true);
    });
  });

  // 7. Error Mapping (handlePgError)
  describe('handlePgError', () => {
    test('Memetakan seluruh kode error PostgreSQL ke AppError standar', () => {
      const { handlePgError } = require('../../src/repositories/postgres/errors');

      expect(handlePgError(null)).toBeNull();

      // 23P01 exclusion
      const errExcl = handlePgError({ code: '23P01', constraint: 'no_double_booking' });
      expect(errExcl.statusCode).toBe(409);
      expect(errExcl.code).toBe('BOOKING_CONFLICT');

      const errMaint = handlePgError({ code: '23P01', constraint: 'no_overlapping_maintenance' });
      expect(errMaint.statusCode).toBe(409);
      expect(errMaint.code).toBe('MAINTENANCE_CONFLICT');

      // 23505 unique
      const errEmail = handlePgError({ code: '23505', constraint: 'idx_users_email_lower' });
      expect(errEmail.statusCode).toBe(409);
      expect(errEmail.code).toBe('EMAIL_TAKEN');

      const errCode = handlePgError({ code: '23505', constraint: 'bookings_booking_code_key' });
      expect(errCode.statusCode).toBe(409);

      const errPromo = handlePgError({ code: '23505', constraint: 'idx_promo_codes_upper' });
      expect(errPromo.statusCode).toBe(409);

      const errRev = handlePgError({ code: '23505', constraint: 'reviews_booking_id_key' });
      expect(errRev.statusCode).toBe(400);

      const errFav = handlePgError({ code: '23505', constraint: 'uq_favorites_user_motor' });
      expect(errFav.statusCode).toBe(409);

      const errSlug = handlePgError({ code: '23505', constraint: 'motorcycles_slug_key' });
      expect(errSlug.statusCode).toBe(409);

      const errPlate = handlePgError({ code: '23505', constraint: 'motorcycles_plate_number_key' });
      expect(errPlate.statusCode).toBe(409);

      const errEvent = handlePgError({ code: '23505', constraint: 'payment_events_provider_event_id_key' });
      expect(errEvent.statusCode).toBe(409);

      // 23503 foreign key
      const errFkUser = handlePgError({ code: '23503', constraint: 'bookings_user_id_fkey' });
      expect(errFkUser.statusCode).toBe(404);

      const errFkMotor = handlePgError({ code: '23503', constraint: 'bookings_motorcycle_id_fkey' });
      expect(errFkMotor.statusCode).toBe(404);

      const errFkBooking = handlePgError({ code: '23503', constraint: 'payments_booking_id_fkey' });
      expect(errFkBooking.statusCode).toBe(404);

      const errFkOther = handlePgError({ code: '23503', constraint: 'other_fkey' });
      expect(errFkOther.statusCode).toBe(404);

      // 08 connection exception
      const errConn = handlePgError({ code: '08006', message: 'Connection dropped' });
      expect(errConn.statusCode).toBe(503);

      // 23514 check
      const errCheck = handlePgError({ code: '23514', constraint: 'chk_reviews_rating' });
      expect(errCheck.statusCode).toBe(422);

      // RM001 trigger
      const errTrig = handlePgError({ code: 'RM001', message: 'Lompatan status ilegal' });
      expect(errTrig.statusCode).toBe(409);

      // 22P02 format
      const errFormat = handlePgError({ code: '22P02' });
      expect(errFormat.statusCode).toBe(400);

      // 57014 timeout
      const errTimeout = handlePgError({ code: '57014' });
      expect(errTimeout.statusCode).toBe(503);

      // 57P shutdown / 53300 capacity
      const errDown = handlePgError({ code: '57P01' });
      expect(errDown.statusCode).toBe(503);

      const errCrash = handlePgError({ code: '57P02' });
      expect(errCrash.statusCode).toBe(503);

      const errCapacity = handlePgError({ code: '53300' });
      expect(errCapacity.statusCode).toBe(503);

      // 40001 serialization / 40P01 deadlock
      const errSerial = handlePgError({ code: '40001' });
      expect(errSerial.statusCode).toBe(503);

      const errDeadlock = handlePgError({ code: '40P01' });
      expect(errDeadlock.statusCode).toBe(503);

      // already AppError
      const existingAppError = new (require('../../src/utils/AppError'))('App err', 'CODE', 418);
      expect(handlePgError(existingAppError)).toBe(existingAppError);

      // default 500
      const errUnknown = handlePgError({ code: '99999', message: 'Some weird error' });
      expect(errUnknown.statusCode).toBe(500);
    });
  });
});
