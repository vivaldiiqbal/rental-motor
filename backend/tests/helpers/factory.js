const bcrypt = require('bcryptjs');
const { pool } = require('../../db/pool');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_PASSWORD = 'Password123!';
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync(DEFAULT_PASSWORD, 8);

let counter = 1;
function uniqueSeq() {
  return `${Date.now()}_${counter++}`;
}

const factory = {
  async createUser(overrides = {}) {
    const seq = uniqueSeq();
    const email = overrides.email || `user_${seq}@test.rodakita.id`;
    const phone = overrides.phone || `0812${String(Math.floor(10000000 + Math.random() * 90000000))}`;
    const name = overrides.name || `User Test ${seq}`;
    const role = overrides.role || 'customer';
    const passwordHash = overrides.password ? bcrypt.hashSync(overrides.password, 8) : DEFAULT_PASSWORD_HASH;
    const isActive = overrides.isActive !== undefined ? overrides.isActive : true;

    const res = await pool.query(
      `INSERT INTO users (email, phone, name, role, password_hash, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       RETURNING id, email, phone, name, role, is_active, created_at`,
      [email, phone, name, role, passwordHash, isActive]
    );
    const createdUser = res.rows[0];

    if (role === 'customer') {
      await pool.query(
        `INSERT INTO renter_profiles (
           user_id, full_name_ktp, birth_date, nik_hash, nik_last4,
           address_ktp, phone_e164, stay_address,
           emergency_name, emergency_relation, emergency_phone,
           terms_version_accepted, privacy_version_accepted, gps_consent_at,
           completed_at, created_at, updated_at
         )
         VALUES ($1, $2, '1995-01-01', $3, '9999',
                 'Alamat KTP Factory', $4, 'Hotel Factory',
                 'Kontak Darurat Factory', 'orang tua', '+6281299990000',
                 1, 1, now(), now(), now(), now())
         ON CONFLICT (user_id) DO NOTHING`,
        [createdUser.id, name, `nik_hash_factory_${createdUser.id}`, createdUser.phone || '+6281299998888']
      );
    }

    return {
      ...createdUser,
      rawPassword: overrides.password || DEFAULT_PASSWORD,
    };
  },

  async createAdmin(overrides = {}) {
    return this.createUser({ role: 'admin', ...overrides });
  },

  async createStaff(overrides = {}) {
    return this.createUser({ role: 'staff', ...overrides });
  },

  async createMotorcycle(overrides = {}) {
    const seq = uniqueSeq();
    const name = overrides.name || `Honda Vario 160 ${seq}`;
    const slug = overrides.slug || `honda-vario-160-${seq}`;
    const brand = overrides.brand || 'Honda';
    const type = overrides.type || 'matic';
    const plateNumber = overrides.plateNumber || `B ${Math.floor(1000 + Math.random() * 9000)} TST`;
    const year = overrides.year || 2023;
    const pricePerDay = overrides.pricePerDay || 100000;
    const deposit = overrides.deposit !== undefined ? overrides.deposit : 200000;
    const color = overrides.color || 'Hitam';
    const status = overrides.status || 'active';
    const transmission = overrides.transmission || 'Automatic';
    const cc = overrides.cc || 160;

    const res = await pool.query(
      `INSERT INTO motorcycles (
        name, slug, brand, type, plate_number, year, color, price_per_day, deposit,
        status, transmission, cc, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
      RETURNING *`,
      [
        name,
        slug,
        brand,
        type,
        plateNumber,
        year,
        color,
        pricePerDay,
        deposit,
        status,
        transmission,
        cc,
      ]
    );
    return res.rows[0];
  },

  async createDocument(userId, overrides = {}) {
    const type = overrides.type || 'ktp';
    const status = overrides.status || 'verified';
    const storedName = overrides.storedName || `${type}_${userId}_test.jpg`;
    const mimeType = overrides.mimeType || 'image/jpeg';
    const sizeBytes = overrides.sizeBytes || 102400;

    const res = await pool.query(
      `INSERT INTO user_documents (user_id, type, stored_name, mime_type, size_bytes, status, uploaded_at, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (user_id, type) DO UPDATE
       SET status = EXCLUDED.status, stored_name = EXCLUDED.stored_name, verified_at = now()
       RETURNING *`,
      [userId, type, storedName, mimeType, sizeBytes, status]
    );
    return res.rows[0];
  },

  async verifyUserDocuments(userId) {
    const ktp = await this.createDocument(userId, { type: 'ktp', status: 'verified' });
    const sim = await this.createDocument(userId, { type: 'sim', status: 'verified' });
    return { ktp, sim };
  },

  async createBooking(overrides = {}) {
    let userId = overrides.userId;
    let renterName = overrides.renterName;
    let renterPhone = overrides.renterPhone;
    let renterEmail = overrides.renterEmail;

    if (!userId) {
      const user = await this.createUser();
      userId = user.id;
      renterName = user.name;
      renterPhone = user.phone;
      renterEmail = user.email;
    }

    let motorcycleId = overrides.motorcycleId;
    let pricePerDay = overrides.pricePerDay || 100000;
    let deposit = overrides.deposit !== undefined ? overrides.deposit : 200000;

    if (!motorcycleId) {
      const motor = await this.createMotorcycle();
      motorcycleId = motor.id;
      pricePerDay = motor.price_per_day;
      deposit = motor.deposit;
    }

    const bookingCode = overrides.code || overrides.bookingCode || `BK-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const startDate = overrides.startDate || '2026-11-01';
    const endDate = overrides.endDate || '2026-11-03';
    const totalDays = overrides.days || overrides.totalDays || 2;
    const subtotal = overrides.subtotal || (pricePerDay * totalDays);
    const durationDiscount = overrides.durationDiscount || 0;
    const promoDiscount = overrides.promoDiscount || 0;
    const deliveryTotal = overrides.deliveryTotal || overrides.deliveryFee || 0;
    const addonsTotal = overrides.addonsTotal || 0;
    const rentalTotal = Math.max(0, subtotal - durationDiscount - promoDiscount + deliveryTotal + addonsTotal);
    const grandTotal = overrides.total || overrides.grandTotal || (rentalTotal + deposit);
    const status = overrides.status || 'pending';
    const expiresAt = overrides.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await pool.query(
      `INSERT INTO bookings (
        booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
        pickup_time, renter_name, renter_phone, renter_email,
        price_per_day, subtotal, duration_discount, promo_discount,
        addons_total, delivery_total, rental_total, deposit, grand_total, status,
        expires_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        '09:00', $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19,
        $20, now(), now()
      )
      RETURNING *`,
      [
        bookingCode,
        userId,
        motorcycleId,
        startDate,
        endDate,
        totalDays,
        renterName || 'Renter Test',
        renterPhone || '08123456789',
        renterEmail || 'renter@test.rodakita.id',
        pricePerDay,
        subtotal,
        durationDiscount,
        promoDiscount,
        addonsTotal,
        deliveryTotal,
        rentalTotal,
        deposit,
        grandTotal,
        status,
        expiresAt,
      ]
    );

    // Initial timeline
    await pool.query(
      `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
       VALUES ($1, $2, $3, $4, now())`,
      [res.rows[0].id, status, `Pemesanan dibuat dengan status ${status}`, 'customer']
    );

    return res.rows[0];
  },

  async createPayment(bookingId, overrides = {}) {
    const amount = overrides.amount || 400000;
    const status = overrides.status || 'paid';
    const method = overrides.method || 'bank_transfer';
    const provider = overrides.provider || 'simulation';
    const gatewayRef = overrides.gatewayRef || `GW-${uniqueSeq()}`;

    const res = await pool.query(
      `INSERT INTO payments (booking_id, amount, status, method, provider, gateway_ref, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       RETURNING *`,
      [bookingId, amount, status, method, provider, gatewayRef]
    );
    return res.rows[0];
  },

  async createPromo(overrides = {}) {
    const seq = uniqueSeq();
    const code = overrides.code || `PROMO_${seq}`;
    const type = overrides.type || 'percent';
    const value = overrides.value || overrides.discountPercent || 10;
    const maxDiscount = overrides.maxDiscount || 50000;
    const minDays = overrides.minDays || 1;
    const weekendOnly = overrides.weekendOnly !== undefined ? overrides.weekendOnly : false;
    const usageLimit = overrides.usageLimit || overrides.maxUses || 100;
    const usedCount = overrides.usedCount || 0;
    const isActive = overrides.isActive !== undefined ? overrides.isActive : true;
    const validFrom = overrides.validFrom || '2026-01-01';
    const validUntil = overrides.validUntil || '2026-12-31';

    const res = await pool.query(
      `INSERT INTO promo_codes (
        code, type, value, max_discount, min_days, weekend_only,
        usage_limit, used_count, is_active, valid_from, valid_until, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
      RETURNING *`,
      [code, type, value, maxDiscount, minDays, weekendOnly, usageLimit, usedCount, isActive, validFrom, validUntil]
    );
    return res.rows[0];
  },

  async initSettings(overrides = {}) {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES
        ('late_fee_tolerance_minutes', $1::jsonb, now()),
        ('late_fee_percent_per_hour', $2::jsonb, now()),
        ('booking_deposit_amount', $3::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
      [
        JSON.stringify(overrides.lateFeeToleranceMinutes ?? 120),
        JSON.stringify(overrides.lateFeePercentPerHour ?? 10),
        JSON.stringify(overrides.bookingDepositAmount ?? 200000),
      ]
    );
  },
};

module.exports = factory;
