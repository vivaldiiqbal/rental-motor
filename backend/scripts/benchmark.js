const { pool } = require('../db/pool');
const { loadSeed } = require('../db/seeds/loadSeed');
const motorService = require('../src/services/motorService');
const availabilityService = require('../src/services/availabilityService');
const { format, addDays } = require('date-fns');

async function runBenchmark() {
  console.log('================================================================');
  console.log('       RODAKITA BACKEND: DATABASE BENCHMARK & EXPLAIN ANALYZE   ');
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    const dbRes = await client.query('SELECT current_database() AS dbname, version()');
    console.log(`Database : ${dbRes.rows[0].dbname}`);
    console.log(`Version  : ${dbRes.rows[0].version.split('\n')[0]}\n`);

    // 1. Reset ke seed dasar sebelum benchmark
    console.log('1. Memuat seed dasar...');
    await loadSeed();

    // 2. EXPLAIN ANALYZE Pencarian Motor dengan Ketersediaan Tanggal
    console.log('\n2. EXPLAIN ANALYZE: Pencarian Motor dengan Filter Tanggal & NOT EXISTS');
    console.log('----------------------------------------------------------------');
    const explainMotorSql = `
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT m.*
      FROM motorcycles m
      WHERE m.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.motorcycle_id = m.id
            AND b.status IN ('pending', 'confirmed', 'active')
            AND daterange(b.start_date, b.end_date, '[)') && daterange('2026-11-01'::date, '2026-11-05'::date, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM maintenance_blocks mb
          WHERE mb.motorcycle_id = m.id
            AND daterange(mb.start_date, mb.end_date, '[)') && daterange('2026-11-01'::date, '2026-11-05'::date, '[)')
        )
      ORDER BY m.rental_count DESC, m.rating_avg DESC, m.id ASC
      LIMIT 12 OFFSET 0;
    `;
    const explainMotorRes = await client.query(explainMotorSql);
    explainMotorRes.rows.forEach((r) => console.log('   ' + r['QUERY PLAN']));

    // 3. EXPLAIN ANALYZE Unavailable Dates (generate_series)
    console.log('\n3. EXPLAIN ANALYZE: Tanggal Tidak Tersedia (generate_series + index scan)');
    console.log('----------------------------------------------------------------');
    const explainUnavailSql = `
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT DISTINCT d::date AS date
      FROM (
        SELECT generate_series(start_date, end_date - INTERVAL '1 day', INTERVAL '1 day')::date AS d
        FROM bookings
        WHERE motorcycle_id = 1
          AND status IN ('pending', 'confirmed', 'active')
          AND start_date < '2027-04-01'::date AND end_date > '2026-10-01'::date
        UNION ALL
        SELECT generate_series(start_date, end_date - INTERVAL '1 day', INTERVAL '1 day')::date AS d
        FROM maintenance_blocks
        WHERE motorcycle_id = 1
          AND start_date < '2027-04-01'::date AND end_date > '2026-10-01'::date
      ) sub
      ORDER BY date ASC;
    `;
    const explainUnavailRes = await client.query(explainUnavailSql);
    explainUnavailRes.rows.forEach((r) => console.log('   ' + r['QUERY PLAN']));

    // 4. Injeksi 10.000 Booking Sintetis pada 14 Motor
    console.log('\n4. Menginjeksi 10.000 Booking Sintetis pada 14 Unit Motor...');
    const targetBookings = 10000;
    const batchSize = 1000;

    await client.query('BEGIN');
    const baseDate = new Date('2021-01-01');

    for (let batch = 0; batch < targetBookings / batchSize; batch++) {
      const valueRows = [];
      const params = [];
      let paramIdx = 1;

      for (let i = 0; i < batchSize; i++) {
        const id = 100000 + batch * batchSize + i;
        const motorId = (i % 14) + 1;
        const code = `RK-SYNTH-${batch}-${i}`;
        const dayOffset = Math.floor(i / 14) * 3 + batch * 300;
        const startDate = format(addDays(baseDate, dayOffset), 'yyyy-MM-dd');
        const endDate = format(addDays(baseDate, dayOffset + 2), 'yyyy-MM-dd');

        params.push(
          id,
          code,
          1,
          motorId,
          startDate,
          endDate,
          2,
          '09:00',
          `Synthetic Renter ${id}`,
          '081234567890',
          'synth@rodakita.id',
          'completed',
          100000,
          200000,
          0,
          0,
          0,
          0,
          200000,
          200000,
          400000,
        );

        const placeholders = [];
        for (let p = 0; p < 21; p++) {
          placeholders.push(`$${paramIdx++}`);
        }
        valueRows.push(`(${placeholders.join(', ')})`);
      }

      const insertSql = `
        INSERT INTO bookings (
          id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
          pickup_time, renter_name, renter_phone, renter_email, status,
          price_per_day, subtotal, duration_discount, promo_discount, addons_total,
          delivery_total, rental_total, deposit, grand_total
        ) VALUES ${valueRows.join(',\n')}
        ON CONFLICT (id) DO NOTHING;
      `;
      await client.query(insertSql, params);
    }
    await client.query('COMMIT');

    const totalCountRes = await client.query('SELECT COUNT(*)::int AS cnt FROM bookings');
    console.log(`   Berhasil menginjeksi. Total baris bookings sekarang: ${totalCountRes.rows[0].cnt} baris.`);

    // 5. ANALYZE tabel bookings dan motorcycles agar statistik PostgreSQL mutakhir
    await client.query('ANALYZE bookings; ANALYZE motorcycles;');

    // 6. Uji Performa: 20 Pemanggilan Query Katalog Motor dengan Filter Ketersediaan
    console.log('\n5. Menjalankan 20 iterasi pengujian performa katalog motor (target < 150 ms)...');
    const durations = [];

    for (let i = 0; i < 20; i++) {
      const start = process.hrtime.bigint();

      // Panggil service yang menggabungkan query SQL, availability check, dan pagination
      await motorService.getMotorcycles({
        start: '2026-11-10',
        end: '2026-11-14',
        sort: 'popular',
        page: 1,
        limit: 12,
      });

      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1000000;
      durations.push(ms);
    }

    durations.sort((a, b) => a - b);
    const min = durations[0].toFixed(2);
    const max = durations[durations.length - 1].toFixed(2);
    const avg = (durations.reduce((acc, v) => acc + v, 0) / durations.length).toFixed(2);
    const p95 = durations[Math.floor(durations.length * 0.95)].toFixed(2);

    console.log('----------------------------------------------------------------');
    console.log(`Hasil Pengujian Performa Katalog (14 Motor x ${totalCountRes.rows[0].cnt} Booking):`);
    console.log(`   - Waktu Minimum : ${min} ms`);
    console.log(`   - Waktu Rata-rata: ${avg} ms`);
    console.log(`   - Waktu P95     : ${p95} ms`);
    console.log(`   - Waktu Maksimum: ${max} ms`);
    console.log('----------------------------------------------------------------');

    // 7. EXPLAIN ANALYZE & Uji Performa Endpoint Admin (Target < 300 ms)
    console.log('\n6. EXPLAIN ANALYZE: Query Dashboard, Daftar Booking, Kalender & Laporan');
    console.log('----------------------------------------------------------------');

    console.log('a) EXPLAIN ANALYZE: Dashboard Summary:');
    const expDash = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_rentals,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_confirmations,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS upcoming_handovers,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_rentals
      FROM bookings;
    `);
    expDash.rows.forEach((r) => console.log('   ' + r['QUERY PLAN']));

    console.log('\nb) EXPLAIN ANALYZE: Daftar Booking dengan Filter Index:');
    const expBook = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT * FROM bookings
      WHERE status = 'confirmed'
      ORDER BY created_at DESC, id DESC
      LIMIT 20 OFFSET 0;
    `);
    expBook.rows.forEach((r) => console.log('   ' + r['QUERY PLAN']));

    console.log('\nc) EXPLAIN ANALYZE: Kalender Ketersediaan (Status Index & Date Range):');
    const expCal = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT motorcycle_id, start_date, end_date, status
      FROM bookings
      WHERE status IN ('pending', 'confirmed', 'active')
        AND start_date <= '2026-11-30' AND end_date >= '2026-11-01';
    `);
    expCal.rows.forEach((r) => console.log('   ' + r['QUERY PLAN']));

    console.log('\nd) EXPLAIN ANALYZE: Laporan Pendapatan (Status IN confirmed, active, completed):');
    const expRep = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT
        to_char((COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS period,
        COUNT(*)::int AS "bookingCount",
        COALESCE(SUM(rental_total), 0)::int AS "rentalTotal"
      FROM bookings b
      LEFT JOIN booking_returns br ON br.booking_id = b.id
      WHERE b.status IN ('confirmed', 'active', 'completed')
        AND (COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta')::date >= '2026-01-01'::date
        AND (COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Jakarta')::date <= '2026-12-31'::date
      GROUP BY 1
      ORDER BY 1 ASC;
    `);
    expRep.rows.forEach((r) => console.log('   ' + r['QUERY PLAN']));

    // Iterasi performa admin
    console.log('\n7. Menjalankan 20 iterasi pengujian endpoint Admin (target < 300 ms)...');
    const adminDurations = [];
    const reportRepo = require('../src/repositories/postgres/reportRepo');

    for (let i = 0; i < 20; i++) {
      const start = process.hrtime.bigint();

      await reportRepo.getDashboardSummary(client);
      await client.query("SELECT * FROM bookings WHERE status = 'confirmed' ORDER BY created_at DESC, id DESC LIMIT 20");
      await reportRepo.getRevenueReport('2026-01-01', '2026-12-31', 'daily', client);

      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1000000;
      adminDurations.push(ms);
    }

    adminDurations.sort((a, b) => a - b);
    const adminMin = adminDurations[0].toFixed(2);
    const adminMax = adminDurations[adminDurations.length - 1].toFixed(2);
    const adminAvg = (adminDurations.reduce((acc, v) => acc + v, 0) / adminDurations.length).toFixed(2);
    const adminP95 = adminDurations[Math.floor(adminDurations.length * 0.95)].toFixed(2);

    console.log('----------------------------------------------------------------');
    console.log(`Hasil Pengujian Performa Endpoint Admin (10.000 Booking Sintetis):`);
    console.log(`   - Waktu Minimum : ${adminMin} ms`);
    console.log(`   - Waktu Rata-rata: ${adminAvg} ms`);
    console.log(`   - Waktu P95     : ${adminP95} ms`);
    console.log(`   - Waktu Maksimum: ${adminMax} ms`);
    console.log('----------------------------------------------------------------');

    if (parseFloat(adminP95) < 300) {
      console.log(`✅ LULUS: Performa respons Admin ${adminP95} ms berada JAUH di bawah ambang batas 300 ms!\n`);
    } else {
      console.warn(`⚠️ PERINGATAN: Performa respons Admin ${adminP95} ms melampaui ambang batas 300 ms!\n`);
    }

    // Kembalikan seed bersih setelah benchmark
    console.log('6. Mengembalikan database ke seed awal...');
    await loadSeed();
    console.log('   Selesai.\n');

    return {
      totalBookings: totalCountRes.rows[0].cnt,
      min,
      avg,
      p95,
      max,
      passed: parseFloat(p95) < 150,
    };
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runBenchmark()
    .then(() => {
      console.log('Benchmark selesai.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Benchmark gagal:', err);
      process.exit(1);
    });
}

module.exports = {
  runBenchmark,
};
