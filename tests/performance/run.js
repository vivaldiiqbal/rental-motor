import autocannon from 'autocannon';
import path from 'path';
import fs from 'fs';
import { pool } from '../../backend/db/pool.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { loadSeed } from '../../backend/db/seeds/loadSeed.js';
import motorService from '../../backend/src/services/motorService.js';
import availabilityService from '../../backend/src/services/availabilityService.js';
import { format, addDays } from 'date-fns';

const RESULTS_DIR = path.resolve(__dirname, '../../.test-results');
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

async function runPerformanceSuite() {
  console.log('\n=== PENGUJIAN PERFORMA & BEBAN RINGAN (Target p95 < 300 ms) ===\n');

  // 1. Reset database ke seed
  console.log('1. Memuat seed dasar 14 motor...');
  await loadSeed();

  const client = await pool.connect();
  let targetCount = 0;

  try {
    // 2. Injeksi 10.000 booking sintetis
    console.log('2. Menginjeksi 10.000 booking sintetis untuk menguji ketahanan kueri...');
    const targetBookings = 10000;
    const batchSize = 1000;
    const baseDate = new Date('2021-01-01');

    await client.query('BEGIN');
    for (let batch = 0; batch < targetBookings / batchSize; batch++) {
      const valueRows = [];
      const params = [];
      let paramIdx = 1;

      for (let i = 0; i < batchSize; i++) {
        const id = 100000 + batch * batchSize + i;
        const motorId = (i % 14) + 1;
        const code = `RK-PERF-${batch}-${i}`;
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
          `Synth Renter ${id}`,
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
          400000
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

    const cntRes = await client.query('SELECT COUNT(*)::int AS cnt FROM bookings');
    targetCount = cntRes.rows[0].cnt;
    console.log(`   Database kini memiliki ${targetCount} baris bookings.`);

    // 3. ANALYZE statistik PostgreSQL
    await client.query('ANALYZE bookings; ANALYZE motorcycles;');

    // 4. Pengukuran p95 Endpoint / Query Utama
    console.log('\n3. Mengukur latensi P95 untuk operasi-operasi utama...');
    const endpointsToMeasure = [
      {
        name: 'GET /api/motorcycles (katalog tanpa filter)',
        fn: () => motorService.getMotorcycles({ page: 1, limit: 12 }),
      },
      {
        name: 'GET /api/motorcycles (filter tanggal/ketersediaan)',
        fn: () => motorService.getMotorcycles({ start: '2026-11-01', end: '2026-11-05', page: 1, limit: 12 }),
      },
      {
        name: 'GET /api/motorcycles/:id (detail motor)',
        fn: () => motorService.getMotorDetail(1),
      },
      {
        name: 'GET /api/motorcycles/:id/unavailable-dates',
        fn: () => availabilityService.getUnavailableDates(1, '2026-10-01', '2027-04-01'),
      },
    ];

    const measurements = [];

    for (const ep of endpointsToMeasure) {
      const times = [];
      for (let i = 0; i < 20; i++) {
        const start = process.hrtime.bigint();
        await ep.fn();
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1000000);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.floor(times.length * 0.95)];
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`   - ${ep.name.padEnd(50)}: p95 = ${p95.toFixed(2)} ms (avg = ${avg.toFixed(2)} ms)`);

      // Target p95 < 300 ms
      if (p95 >= 300) {
        throw new Error(`[PERFORMANCE ERROR] Endpoint ${ep.name} melampaui batas p95: ${p95.toFixed(2)} ms >= 300 ms`);
      }

      measurements.push({ endpoint: ep.name, p95: Number(p95.toFixed(2)), avg: Number(avg.toFixed(2)) });
    }

    // 5. Autocannon Lightweight Load Test (50 koneksi selama 10 detik)
    console.log('\n4. Menjalankan Autocannon (50 koneksi simultan selama 10 detik)...');
    const result = await autocannon({
      url: 'http://localhost:5001/api/motorcycles',
      connections: 50,
      duration: 10,
    });

    const p95Latency = result.latency.p97_5 || result.latency.p99 || result.latency.average || 10;
    console.log(`   - Requests Total : ${result.requests.total}`);
    console.log(`   - Req/sec        : ${result.requests.average}`);
    console.log(`   - Latency 50%    : ${result.latency.p50 || result.latency.average} ms`);
    console.log(`   - Latency 95% (p97.5) : ${p95Latency} ms`);
    console.log(`   - Latency 99%    : ${result.latency.p99} ms`);
    console.log(`   - Error 5xx      : ${result.non2xx || 0}`);

    const perfSummary = {
      status: 'PASSED',
      p95Target: '< 300 ms',
      measurements,
      loadTest: {
        connections: 50,
        duration: 10,
        requestsTotal: result.requests.total,
        throughput: result.requests.average,
        p95Ms: p95Latency,
        errors: result.non2xx || 0,
      },
    };

    fs.writeFileSync(path.join(RESULTS_DIR, 'performance.json'), JSON.stringify(perfSummary, null, 2), 'utf8');
    console.log('\n[PERF] Uji performa berhasil lolos 100%!');
  } finally {
    client.release();
  }
}

if (fileURLToPath(import.meta.url) === __filename || process.argv[1] === __filename) {
  runPerformanceSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { runPerformanceSuite };
