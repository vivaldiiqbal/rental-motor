const { pool } = require('../../db/pool');
const { loadSeed } = require('../../db/seeds/loadSeed');

describe('Integration Test: Database Schema Constraints & Triggers', () => {
  beforeEach(async () => {
    if (process.env.USE_DB === 'postgres') {
      await loadSeed();
    }
  });

  afterAll(async () => {
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  test('Exclusion Constraint: Menolak booking beririsan pada motor yang sama (no_double_booking)', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // 1. Masukkan booking pertama: 2027-01-10 s/d 2027-01-15
      await client.query(`
        INSERT INTO bookings (
          id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
          pickup_time, renter_name, renter_phone, renter_email, status,
          price_per_day, subtotal, duration_discount, promo_discount, addons_total,
          delivery_total, rental_total, deposit, grand_total
        ) VALUES (
          9001, 'RK-EXCL-1', 1, 3, '2027-01-10', '2027-01-15', 5,
          '09:00', 'Tester', '081234567890', 'test@test.com', 'confirmed',
          100000, 500000, 0, 0, 0, 0, 500000, 200000, 700000
        )
      `);

      // 2. Coba masukkan booking kedua beririsan: 2027-01-12 s/d 2027-01-18 pada motor 3
      await expect(
        client.query(`
          INSERT INTO bookings (
            id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, renter_name, renter_phone, renter_email, status,
            price_per_day, subtotal, duration_discount, promo_discount, addons_total,
            delivery_total, rental_total, deposit, grand_total
          ) VALUES (
            9002, 'RK-EXCL-2', 2, 3, '2027-01-12', '2027-01-18', 6,
            '09:00', 'Tester 2', '081234567891', 'test2@test.com', 'pending',
            100000, 600000, 0, 0, 0, 0, 600000, 200000, 800000
          )
        `),
      ).rejects.toThrow(/no_double_booking|23P01/);
    } finally {
      client.release();
    }
  });

  test('CHECK Constraint: Menolak booking jika end_date <= start_date', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      await expect(
        client.query(`
          INSERT INTO bookings (
            id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, renter_name, renter_phone, renter_email, status,
            price_per_day, subtotal, duration_discount, promo_discount, addons_total,
            delivery_total, rental_total, deposit, grand_total
          ) VALUES (
            9003, 'RK-CHK-DATE', 1, 3, '2027-02-15', '2027-02-10', 0,
            '09:00', 'Tester', '081234567890', 'test@test.com', 'pending',
            100000, 100000, 0, 0, 0, 0, 100000, 200000, 300000
          )
        `),
      ).rejects.toThrow(/chk_bookings_date_order|chk_bookings_dates/);
    } finally {
      client.release();
    }
  });

  test('CHECK Constraint: Menolak kalkulasi harga yang tidak konsisten', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // grand_total sengaja diselisihkan (seharusnya 700000 tapi diisi 999999)
      await expect(
        client.query(`
          INSERT INTO bookings (
            id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, renter_name, renter_phone, renter_email, status,
            price_per_day, subtotal, duration_discount, promo_discount, addons_total,
            delivery_total, rental_total, deposit, grand_total
          ) VALUES (
            9004, 'RK-CHK-PRICE', 1, 3, '2027-03-01', '2027-03-05', 4,
            '09:00', 'Tester', '081234567890', 'test@test.com', 'pending',
            100000, 400000, 0, 0, 0, 0, 400000, 200000, 999999
          )
        `),
      ).rejects.toThrow(/chk_bookings_grand_total|chk_bookings_pricing_consistency/);
    } finally {
      client.release();
    }
  });

  test('CHECK Constraint: Menolak rating ulasan di luar 1 s/d 5 (rating 0 atau 6)', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // Rating 0
      await expect(
        client.query(`
          INSERT INTO reviews (booking_id, user_id, motorcycle_id, rating, comment)
          VALUES (1, 1, 1, 0, 'Terlalu jelek')
        `),
      ).rejects.toThrow(/chk_reviews_rating|23514/);

      // Rating 6
      await expect(
        client.query(`
          INSERT INTO reviews (booking_id, user_id, motorcycle_id, rating, comment)
          VALUES (1, 1, 1, 6, 'Terlalu bagus')
        `),
      ).rejects.toThrow(/chk_reviews_rating|23514/);
    } finally {
      client.release();
    }
  });

  test('UNIQUE Constraint: Menolak dua ulasan untuk booking yang sama', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // Booking 1 sudah memiliki ulasan atau buat baru
      await client.query(`
        INSERT INTO reviews (booking_id, user_id, motorcycle_id, rating, comment)
        VALUES (8, 1, 2, 5, 'Ulasan pertama')
        ON CONFLICT (booking_id) DO NOTHING
      `);

      // Coba masukkan ulasan kedua untuk booking 8
      await expect(
        client.query(`
          INSERT INTO reviews (booking_id, user_id, motorcycle_id, rating, comment)
          VALUES (8, 1, 2, 4, 'Ulasan duplikat')
        `),
      ).rejects.toThrow(/reviews_booking_id_key|duplicate key/);
    } finally {
      client.release();
    }
  });

  test('UNIQUE Index: Menolak dua pembayaran pending untuk booking yang sama', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // Booking 5 sudah memiliki 1 pembayaran pending
      // Coba masukkan pembayaran pending kedua untuk booking 5
      await expect(
        client.query(`
          INSERT INTO payments (booking_id, method, provider, status, amount)
          VALUES (5, 'bank_transfer', 'simulation', 'pending', 420000)
        `),
      ).rejects.toThrow(/idx_payments_one_pending|duplicate key/);
    } finally {
      client.release();
    }
  });

  test('Exclusion Constraint: Menolak blok servis yang beririsan untuk motor yang sama (no_overlapping_maintenance)', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO maintenance_blocks (motorcycle_id, start_date, end_date, reason)
        VALUES (5, '2027-04-01', '2027-04-05', 'Ganti oli')
      `);

      // Coba blok servis bertabrakan pada motor 5
      await expect(
        client.query(`
          INSERT INTO maintenance_blocks (motorcycle_id, start_date, end_date, reason)
          VALUES (5, '2027-04-03', '2027-04-07', 'Ganti ban')
        `),
      ).rejects.toThrow(/no_overlapping_maintenance|23P01/);
    } finally {
      client.release();
    }
  });

  test('Trigger Constraint: Menolak lompatan status ilegal pada bookings (RM001)', async () => {
    if (process.env.USE_DB !== 'postgres') return;

    const client = await pool.connect();
    try {
      // Booking 5 berstatus pending: tidak boleh langsung melompat ke completed
      await expect(
        client.query(`
          UPDATE bookings
          SET status = 'completed'
          WHERE id = 5
        `),
      ).rejects.toThrow(/Transisi status booking/);

      // Booking 1 berstatus completed: status terminal, tidak boleh berubah ke active
      await expect(
        client.query(`
          UPDATE bookings
          SET status = 'active'
          WHERE id = 1
        `),
      ).rejects.toThrow(/Transisi status booking/);
    } finally {
      client.release();
    }
  });
});
