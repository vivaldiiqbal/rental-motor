const { pool } = require('../../db/pool');
const { resetDatabase } = require('../../db/reset');
const store = require('../../src/repositories/store');

// Repositories
const memoryUserRepo = require('../../src/repositories/memory/userRepo');
const memoryMotorRepo = require('../../src/repositories/memory/motorRepo');
const memoryBookingRepo = require('../../src/repositories/memory/bookingRepo');
const memoryPaymentRepo = require('../../src/repositories/memory/paymentRepo');
const memoryReviewRepo = require('../../src/repositories/memory/reviewRepo');
const memoryFavoriteRepo = require('../../src/repositories/memory/favoriteRepo');
const memoryPromoRepo = require('../../src/repositories/memory/promoRepo');
const memoryContactRepo = require('../../src/repositories/memory/contactRepo');
const memoryIdempotencyRepo = require('../../src/repositories/memory/idempotencyRepo');
const memoryMetaRepo = require('../../src/repositories/memory/metaRepo');

const postgresUserRepo = require('../../src/repositories/postgres/userRepo');
const postgresMotorRepo = require('../../src/repositories/postgres/motorRepo');
const postgresBookingRepo = require('../../src/repositories/postgres/bookingRepo');
const postgresPaymentRepo = require('../../src/repositories/postgres/paymentRepo');
const postgresReviewRepo = require('../../src/repositories/postgres/reviewRepo');
const postgresFavoriteRepo = require('../../src/repositories/postgres/favoriteRepo');
const postgresPromoRepo = require('../../src/repositories/postgres/promoRepo');
const postgresContactRepo = require('../../src/repositories/postgres/contactRepo');
const postgresIdempotencyRepo = require('../../src/repositories/postgres/idempotencyRepo');
const postgresMetaRepo = require('../../src/repositories/postgres/metaRepo');

const drivers = [
  {
    name: 'memory',
    userRepo: memoryUserRepo,
    motorRepo: memoryMotorRepo,
    bookingRepo: memoryBookingRepo,
    paymentRepo: memoryPaymentRepo,
    reviewRepo: memoryReviewRepo,
    favoriteRepo: memoryFavoriteRepo,
    promoRepo: memoryPromoRepo,
    contactRepo: memoryContactRepo,
    idempotencyRepo: memoryIdempotencyRepo,
    metaRepo: memoryMetaRepo,
    setup: async () => {
      store.resetToSeed();
    },
    teardown: async () => {},
  },
  {
    name: 'postgres',
    userRepo: postgresUserRepo,
    motorRepo: postgresMotorRepo,
    bookingRepo: postgresBookingRepo,
    paymentRepo: postgresPaymentRepo,
    reviewRepo: postgresReviewRepo,
    favoriteRepo: postgresFavoriteRepo,
    promoRepo: postgresPromoRepo,
    contactRepo: postgresContactRepo,
    idempotencyRepo: postgresIdempotencyRepo,
    metaRepo: postgresMetaRepo,
    setup: async () => {
      await resetDatabase(pool);
    },
    teardown: async () => {
      // Tidak perlu menutup pool di sini, ditutup di akhir test suite
    },
  },
];

describe('Contract Test: Storage Repositories Parity', () => {


  drivers.forEach(({ name, userRepo, motorRepo, bookingRepo, paymentRepo, reviewRepo, favoriteRepo, promoRepo, contactRepo, idempotencyRepo, metaRepo, setup }) => {
    describe(`Driver: ${name}`, () => {
      beforeAll(async () => {
        await setup();
      }, 30000);

      // ----------------------------------------------------------------------
      // 1. User Repository Contract
      // ----------------------------------------------------------------------
      describe('userRepo', () => {
        const testEmail = `test_${name}_${Date.now()}@example.com`;
        let createdUserId;

        test('create: membuat pengguna baru', async () => {
          const user = await userRepo.create({
            name: 'Contract Test User',
            email: testEmail,
            phone: '+6281234567890',
            address: 'Denpasar, Bali',
            role: 'customer',
            passwordHash: '$2a$10$hashedpassworddummy',
            preferences: { emailNotif: true, whatsappNotif: true, promo: false },
          });

          expect(user).toBeDefined();
          expect(user.id).toBeDefined();
          expect(user.name).toBe('Contract Test User');
          expect(user.email).toBe(testEmail.toLowerCase());
          expect(user.role).toBe('customer');
          expect(user.documents).toEqual({ ktp: 'not_uploaded', sim: 'not_uploaded' });
          createdUserId = user.id;
        });

        test('findById: mengambil pengguna berdasarkan ID', async () => {
          const user = await userRepo.findById(createdUserId);
          expect(user).toBeDefined();
          expect(user.id).toBe(createdUserId);
          expect(user.email).toBe(testEmail.toLowerCase());
        });

        test('findByEmail: case-insensitive search email', async () => {
          const user = await userRepo.findByEmail(testEmail.toUpperCase());
          expect(user).toBeDefined();
          expect(user.id).toBe(createdUserId);
        });

        test('update: memperbarui data profil dan status dokumen', async () => {
          const updated = await userRepo.update(createdUserId, {
            name: 'Updated Name Contract',
            documents: { ktp: 'verified', sim: 'pending' },
            documentPaths: { ktp: '/uploads/ktp-test.jpg' },
          });

          expect(updated).toBeDefined();
          expect(updated.name).toBe('Updated Name Contract');
          expect(updated.documents.ktp).toBe('verified');
          expect(updated.documents.sim).toBe('pending');
        });

        test('findAll: mendukung pagination dan filter role', async () => {
          const result = await userRepo.findAll({ role: 'customer' }, { page: 1, limit: 5 });
          expect(result).toHaveProperty('items');
          expect(result).toHaveProperty('total');
          expect(Array.isArray(result.items)).toBe(true);
          expect(result.items.length).toBeGreaterThan(0);
          expect(result.items.every((u) => u.role === 'customer')).toBe(true);
        });
      });

      // ----------------------------------------------------------------------
      // 2. Motor Repository Contract
      // ----------------------------------------------------------------------
      describe('motorRepo', () => {
        test('findById: mengambil motor berdasarkan ID', async () => {
          const motor = await motorRepo.findById(1);
          expect(motor).toBeDefined();
          expect(motor.id).toBe(1);
          expect(typeof motor.name).toBe('string');
          expect(typeof motor.pricePerDay).toBe('number');
          expect(typeof motor.deposit).toBe('number');
          expect(Array.isArray(motor.features)).toBe(true);
          expect(Array.isArray(motor.images)).toBe(true);
        });

        test('findBySlug: mengambil motor berdasarkan slug unik', async () => {
          const motor = await motorRepo.findBySlug('honda-beat');
          expect(motor).toBeDefined();
          expect(motor.slug).toBe('honda-beat');
        });

        test('findAll: filter berdasarkan status, tipe, dan merek', async () => {
          const res = await motorRepo.findAll({ status: 'available', type: 'matic' }, { page: 1, limit: 10 });
          expect(Array.isArray(res.items)).toBe(true);
          expect(res.total).toBeGreaterThan(0);
          expect(res.items.every((m) => m.status === 'available' && m.type === 'matic')).toBe(true);
        });

        test('findFeatured: mengembalikan rekomendasi motor terpopuler', async () => {
          const featured = await motorRepo.findFeatured(4);
          expect(Array.isArray(featured)).toBe(true);
          expect(featured.length).toBeLessThanOrEqual(4);
          expect(featured.every((m) => m.status === 'available')).toBe(true);
        });

        test('getDistinctBrands: mengembalikan daftar merek unik terurut', async () => {
          const brands = await motorRepo.getDistinctBrands();
          expect(Array.isArray(brands)).toBe(true);
          expect(brands.length).toBeGreaterThan(0);
          expect(brands).toContain('Honda');
          expect(brands).toContain('Yamaha');
        });

        test('getPriceRange: mengembalikan rentang harga sewa terendah & tertinggi', async () => {
          const range = await motorRepo.getPriceRange();
          expect(range).toHaveProperty('min');
          expect(range).toHaveProperty('max');
          expect(range.min).toBeGreaterThan(0);
          expect(range.max).toBeGreaterThanOrEqual(range.min);
        });
      });

      // ----------------------------------------------------------------------
      // 3. Booking Repository Contract & [start, end) Overlap Semantics
      // ----------------------------------------------------------------------
      describe('bookingRepo', () => {
        let testBookingId;
        const testCode = `RM-CONTRACT-${name.toUpperCase()}-${Date.now().toString().slice(-4)}`;

        test('create: membuat booking baru lengkap', async () => {
          const booking = await bookingRepo.create({
            code: testCode,
            userId: 1,
            motorId: 2,
            startDate: '2028-06-10',
            endDate: '2028-06-13',
            pickupTime: '09:00',
            days: 3,
            pricePerDay: 85000,
            subtotal: 255000,
            discount: 0,
            durationDiscount: 0,
            weekendSurcharge: 0,
            deliveryFee: 0,
            addOnsTotal: 0,
            deposit: 200000,
            total: 455000,
            status: 'confirmed',
            pickup: 'store',
            payment: 'bank_transfer',
            renter: { name: 'Contract Renter', phone: '+628111222333', email: 'renter@test.com' },
            timeline: [{ status: 'confirmed', at: new Date().toISOString(), note: 'Confirmed contract test' }],
            idempotencyKey: `idem-${testCode}`,
          });

          expect(booking).toBeDefined();
          expect(booking.id).toBeDefined();
          expect(booking.code).toBe(testCode);
          expect(booking.startDate).toBe('2028-06-10');
          expect(booking.endDate).toBe('2028-06-13');
          expect(booking.days).toBe(3);
          expect(booking.total).toBe(455000);
          expect(booking.status).toBe('confirmed');
          testBookingId = booking.id;
        });

        test('findById: mengambil booking berdasarkan ID', async () => {
          const b = await bookingRepo.findById(testBookingId);
          expect(b).toBeDefined();
          expect(b.id).toBe(testBookingId);
          expect(b.code).toBe(testCode);
        });

        test('findByCode: mengambil booking berdasarkan kode', async () => {
          const b = await bookingRepo.findByCode(testCode.toLowerCase());
          expect(b).toBeDefined();
          expect(b.id).toBe(testBookingId);
        });

        test('findOverlapping: Semantik [start, end): pickup pada tanggal kembali sewa lain TIDAK BENTROK', async () => {
          // Existing booking: 2028-06-10 s/d 2028-06-13 (motor 2)
          // 1. Booking baru tepat di tanggal kembali (2028-06-13 s/d 2028-06-15) -> HARUS TIDAK BENTROK
          const pickupOnReturn = await bookingRepo.findOverlapping(2, '2028-06-13', '2028-06-15');
          const isConflict1 = pickupOnReturn.some((b) => b.code === testCode);
          expect(isConflict1).toBe(false);

          // 2. Booking baru selesai tepat di tanggal ambil (2028-06-07 s/d 2028-06-10) -> HARUS TIDAK BENTROK
          const returnOnPickup = await bookingRepo.findOverlapping(2, '2028-06-07', '2028-06-10');
          const isConflict2 = returnOnPickup.some((b) => b.code === testCode);
          expect(isConflict2).toBe(false);

          // 3. Booking baru beririsan di dalam rentang (2028-06-11 s/d 2028-06-12) -> HARUS BENTROK
          const insideOverlap = await bookingRepo.findOverlapping(2, '2028-06-11', '2028-06-12');
          const isConflict3 = insideOverlap.some((b) => b.code === testCode);
          expect(isConflict3).toBe(true);

          // 4. Booking baru melewati tanggal kembali (2028-06-12 s/d 2028-06-14) -> HARUS BENTROK
          const crossOverlap = await bookingRepo.findOverlapping(2, '2028-06-12', '2028-06-14');
          const isConflict4 = crossOverlap.some((b) => b.code === testCode);
          expect(isConflict4).toBe(true);
        });

        test('findBlockedRanges: mengembalikan rentang tanggal terisi', async () => {
          const ranges = await bookingRepo.findBlockedRanges(2);
          expect(Array.isArray(ranges)).toBe(true);
          const hasOurRange = ranges.some((r) => r.from === '2028-06-10' && r.to === '2028-06-13');
          expect(hasOurRange).toBe(true);
        });

        test('update: memperbarui status dan timeline booking', async () => {
          await bookingRepo.update(testBookingId, {
            status: 'active',
          });
          const updated = await bookingRepo.update(testBookingId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          });
          expect(updated).toBeDefined();
          expect(updated.status).toBe('completed');
          expect(updated.completedAt).toBeDefined();
        });
      });

      // ----------------------------------------------------------------------
      // 4. Payment Repository Contract
      // ----------------------------------------------------------------------
      describe('paymentRepo', () => {
        test('create: membuat pencatatan pembayaran', async () => {
          const payment = await paymentRepo.create({
            bookingId: 1,
            amount: 150000,
            deposit: 200000,
            method: 'qris',
            status: 'paid',
            provider: 'simulation',
            transactionId: `TRX-${name}-${Date.now()}`,
          });

          expect(payment).toBeDefined();
          expect(payment.amount).toBe(150000);
          expect(payment.deposit).toBe(200000);
          expect(payment.method).toBe('qris');
          expect(payment.status).toBe('paid');
        });

        test('findByBookingId: mengambil payment untuk booking tertentu', async () => {
          const p = await paymentRepo.findByBookingId(1);
          expect(p).toBeDefined();
          expect(p.bookingId).toBe(1);
        });
      });

      // ----------------------------------------------------------------------
      // 5. Review Repository Contract & Stats Recalculation
      // ----------------------------------------------------------------------
      describe('reviewRepo', () => {
        let createdReviewId;

        test('create: membuat review baru', async () => {
          const review = await reviewRepo.create({
            motorId: 3,
            userId: 1,
            userName: 'Reviewer Test',
            rating: 5,
            comment: 'Sangat puas dengan performa motor ini!',
            date: '2026-10-20',
          });

          expect(review).toBeDefined();
          expect(review.id).toBeDefined();
          expect(review.rating).toBe(5);
          expect(review.comment).toBe('Sangat puas dengan performa motor ini!');
          createdReviewId = review.id;
        });

        test('calculateStats: menghitung rata-rata rating dan total ulasan', async () => {
          const stats = await reviewRepo.calculateStats(3);
          expect(stats).toBeDefined();
          expect(typeof stats.rating).toBe('number');
          expect(typeof stats.reviewCount).toBe('number');
          expect(stats.reviewCount).toBeGreaterThan(0);
          expect(stats.rating).toBeGreaterThanOrEqual(1.0);
          expect(stats.rating).toBeLessThanOrEqual(5.0);
        });

        test('delete: menghapus review', async () => {
          const success = await reviewRepo.delete(createdReviewId);
          expect(success).toBe(true);
        });
      });

      // ----------------------------------------------------------------------
      // 6. Favorite Repository Contract
      // ----------------------------------------------------------------------
      describe('favoriteRepo', () => {
        test('add & isFavorite: menambah motor ke favorit dan cek status', async () => {
          await favoriteRepo.add(1, 4);
          const isFav = await favoriteRepo.isFavorite(1, 4);
          expect(isFav).toBe(true);
        });

        test('findByUserId: mengambil semua favorit user', async () => {
          const favs = await favoriteRepo.findByUserId(1);
          expect(Array.isArray(favs)).toBe(true);
          expect(favs.some((f) => Number(f.motorId) === 4)).toBe(true);
        });

        test('sync: menyinkronkan array ID motor favorit', async () => {
          const synced = await favoriteRepo.sync(1, [4, 5]);
          expect(Array.isArray(synced)).toBe(true);
          expect(synced).toContain(4);
          expect(synced).toContain(5);
        });

        test('remove: menghapus dari favorit', async () => {
          const success = await favoriteRepo.remove(1, 4);
          expect(success).toBe(true);
          const isFav = await favoriteRepo.isFavorite(1, 4);
          expect(isFav).toBe(false);
        });
      });

      // ----------------------------------------------------------------------
      // 7. Promo Repository Contract & Atomic Quota
      // ----------------------------------------------------------------------
      describe('promoRepo', () => {
        test('findByCode: mencari promo berdasarkan kode (case-insensitive)', async () => {
          const promo = await promoRepo.findByCode('hemat10');
          expect(promo).toBeDefined();
          expect(promo.code).toBe('HEMAT10');
          expect(promo.type).toBe('percent');
          expect(promo.value).toBe(10);
        });

        test('findAll: mengambil semua promo aktif', async () => {
          const promos = await promoRepo.findAll(true);
          expect(Array.isArray(promos)).toBe(true);
          expect(promos.length).toBeGreaterThan(0);
          expect(promos.every((p) => p.isActive && p.quota > 0)).toBe(true);
        });

        test('decrementQuota & incrementQuota: mengurangi dan memulihkan kuota', async () => {
          const before = await promoRepo.findByCode('HEMAT10');
          const initialQuota = before.quota;

          const decSuccess = await promoRepo.decrementQuota('HEMAT10');
          expect(decSuccess).toBe(true);

          const afterDec = await promoRepo.findByCode('HEMAT10');
          expect(afterDec.quota).toBe(initialQuota - 1);

          const incSuccess = await promoRepo.incrementQuota('HEMAT10');
          expect(incSuccess).toBe(true);

          const afterInc = await promoRepo.findByCode('HEMAT10');
          expect(afterInc.quota).toBe(initialQuota);
        });
      });

      // ----------------------------------------------------------------------
      // 8. Contact Repository Contract
      // ----------------------------------------------------------------------
      describe('contactRepo', () => {
        let contactId;

        test('create: menyimpan pesan kontak baru', async () => {
          const contact = await contactRepo.create({
            name: 'Contact Sender',
            email: 'sender@example.com',
            phone: '08123456789',
            subject: 'Pertanyaan Sewa Mingguan',
            message: 'Halo, apakah ada diskon tambahan untuk sewa sebulan penuh?',
          });

          expect(contact).toBeDefined();
          expect(contact.id).toBeDefined();
          expect(contact.email).toBe('sender@example.com');
          expect(contact.read).toBe(false);
          contactId = contact.id;
        });

        test('findById: mengambil pesan kontak berdasarkan ID', async () => {
          const c = await contactRepo.findById(contactId);
          expect(c).toBeDefined();
          expect(c.id).toBe(contactId);
        });

        test('findAll: mengambil pesan kontak dengan pagination', async () => {
          const res = await contactRepo.findAll({ page: 1, limit: 10 });
          expect(res).toHaveProperty('items');
          expect(res).toHaveProperty('total');
          expect(Array.isArray(res.items)).toBe(true);
        });
      });

      // ----------------------------------------------------------------------
      // 9. Idempotency Repository Contract
      // ----------------------------------------------------------------------
      describe('idempotencyRepo', () => {
        const testKey = `test-idem-key-${name}-${Date.now()}`;

        test('create & findByKey: menyimpan dan mencari record idempotensi', async () => {
          const saved = await idempotencyRepo.create({
            key: testKey,
            userId: 1,
            resourceId: 999,
            responseBody: { success: true, bookingCode: 'RM-TEST-123' },
            statusCode: 201,
          });

          expect(saved).toBeDefined();
          expect(saved.key).toBe(testKey);

          const found = await idempotencyRepo.findByKey(testKey, 1);
          expect(found).toBeDefined();
          expect(found.statusCode).toBe(201);
          expect(found.responseBody).toEqual({ success: true, bookingCode: 'RM-TEST-123' });
        });

        test('delete: menghapus record idempotensi', async () => {
          const deleted = await idempotencyRepo.delete(testKey);
          expect(deleted).toBe(true);
          const found = await idempotencyRepo.findByKey(testKey);
          expect(found).toBeNull();
        });
      });

      // ----------------------------------------------------------------------
      // 10. Meta Repository Contract
      // ----------------------------------------------------------------------
      describe('metaRepo', () => {
        test('getRentalOptions: mengembalikan opsi rental lengkap', () => {
          const options = metaRepo.getRentalOptions();
          expect(options).toHaveProperty('pickupLocations');
          expect(options).toHaveProperty('addOns');
          expect(options).toHaveProperty('deliveryFees');
          expect(options).toHaveProperty('rules');
          expect(Array.isArray(options.pickupLocations)).toBe(true);
          expect(Array.isArray(options.addOns)).toBe(true);
        });
      });
    });
  });
});
