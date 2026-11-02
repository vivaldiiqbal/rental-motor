#!/usr/bin/env node
/**
 * Simulator Pelacakan GPS RodaKita
 * Mengirimkan telemetri posisi motor secara berkala ke endpoint Ingest.
 * 
 * Penggunaan:
 *   npm run gps:simulate
 *   node backend/scripts/simulateGps.js --provision
 *   node backend/scripts/simulateGps.js --scenario normal --interval 2000
 *   node backend/scripts/simulateGps.js --scenario keluar_area
 *   node backend/scripts/simulateGps.js --scenario kecepatan
 *   node backend/scripts/simulateGps.js --scenario baterai_rendah
 *   node backend/scripts/simulateGps.js --scenario daya_terputus
 *   node backend/scripts/simulateGps.js --scenario gerak_tanpa_sewa
 *   node backend/scripts/simulateGps.js --scenario terlambat_kembali
 *   node backend/scripts/simulateGps.js --scenario data_tertunda
 *   node backend/scripts/simulateGps.js --scenario offline
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Penolakan tegas di production sesuai PRD
if (process.env.NODE_ENV === 'production') {
  console.error('====================================================================');
  console.error('[FATAL] Simulator GPS menolak berjalan di lingkungan PRODUCTION!');
  console.error('====================================================================');
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(key, defaultValue) {
  const idx = args.indexOf(`--${key}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return defaultValue;
}

const isProvisionMode = args.includes('--provision');
const SCENARIO = getArg('scenario', 'normal');
const INTERVAL_MS = parseInt(getArg('interval', '3000'), 10);
const DEVICE_ID = getArg('device', 'GPS-SIM-VARIO-01');
const MOTOR_ID = getArg('motor-id', '1');
const MAX_STEPS = parseInt(getArg('steps', '0'), 10); // 0 = infinite
const INGEST_URL = getArg('url', process.env.GPS_INGEST_URL || 'http://localhost:5001/api/gps/ingest/simulator');
const SECRET = getArg('secret', process.env.GPS_SIMULATOR_SECRET || process.env.GPS_INGEST_SECRET || 'rodakita_gps_secret_shared_key_2026');
const SEED = getArg('seed', null);

// PRNG Deterministic jika diberikan --seed
let rngState = SEED ? parseInt(SEED, 10) || 12345 : null;
function random() {
  if (rngState === null) return Math.random();
  // Mulberry32 generator
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Titik dasar: Kawasan Denpasar / Sanur / Kuta
const BASE_LAT = parseFloat(getArg('base-lat', '-8.670458'));
const BASE_LNG = parseFloat(getArg('base-lng', '115.212629'));

let currentLat = BASE_LAT;
let currentLng = BASE_LNG;
let currentHeading = 90; // Menghadap timur
let currentSpeed = 35;
let batteryLevel = 95;
let step = 0;

/**
 * Logika Provisioning Perangkat untuk Semua Motor yang Ada
 */
async function provisionSimulatorDevices() {
  console.log('====================================================');
  console.log('   PROVISIONING PERANGKAT GPS SIMULATOR');
  console.log('====================================================');

  try {
    const { motorRepo, gpsRepo } = require('../src/repositories');
    const motorsRes = await motorRepo.findAll({}, { page: 1, limit: 100 });
    const motors = Array.isArray(motorsRes) ? motorsRes : (motorsRes.items || motorsRes.data || []);

    console.log(`Menemukan ${motors.length} motor di database.`);
    let createdCount = 0;

    for (const motor of motors) {
      const existing = await gpsRepo.findDeviceByMotorcycleId(motor.id);
      if (!existing) {
        const cleanPlate = (motor.plateNumber || `MTR-${motor.id}`).replace(/[^a-zA-Z0-9]/g, '');
        const extId = `GPS-SIM-${cleanPlate}`;
        const newDev = await gpsRepo.createDevice({
          motorcycleId: motor.id,
          provider: 'simulator',
          externalId: extId,
          label: `GPS Tracker ${motor.name} (${motor.plateNumber})`,
          isActive: true,
          batteryPct: 98,
        });
        console.log(`[+] Terpasang: Motor "${motor.name}" (${motor.plateNumber}) -> External ID: ${newDev.externalId}`);
        createdCount++;
      } else {
        console.log(`[.] Sudah ada: Motor "${motor.name}" -> Tracker: ${existing.externalId}`);
      }
    }

    console.log(`\nSelesai! Berhasil mendaftarkan ${createdCount} perangkat GPS simulator baru.`);
    process.exit(0);
  } catch (err) {
    console.error('[FATAL] Gagal melakukan provisioning:', err.message);
    process.exit(1);
  }
}

if (isProvisionMode) {
  provisionSimulatorDevices();
  return;
}

console.log('====================================================');
console.log('   RODAKITA GPS TELEMETRY SIMULATOR');
console.log('====================================================');
console.log(` Target Ingest URL : ${INGEST_URL}`);
console.log(` Device External ID: ${DEVICE_ID}`);
console.log(` Skenario          : ${SCENARIO.toUpperCase()}`);
console.log(` Interval          : ${INTERVAL_MS} ms`);
console.log(` Base Coordinate   : [${BASE_LAT}, ${BASE_LNG}]`);
console.log(` Random Seed       : ${SEED || 'Acak (Non-deterministik)'}`);
console.log(` Max Steps         : ${MAX_STEPS > 0 ? MAX_STEPS : 'Kontinu (Ctrl+C untuk berhenti)'}`);
console.log('====================================================\n');

function calculateNextPoint(scenario, currentStep) {
  let lat = currentLat;
  let lng = currentLng;
  let speed = currentSpeed;
  let heading = currentHeading;
  let battery = batteryLevel;
  let ignition = true;
  let powerCut = false;
  let recordedAt = new Date().toISOString();

  switch (scenario.toLowerCase().replace(/-/g, '_')) {
    case 'geofence_exit':
    case 'keluar_area':
      // Melaju cepat ke arah luar batas area wilayah yang diizinkan (ke arah utara/pegunungan jauh)
      lat += 0.0055; // bergerak ~600m per tick
      lng += 0.0040;
      speed = 68.0;
      heading = 35;
      battery = Math.max(15, battery - 0.2);
      break;

    case 'overspeed':
    case 'kecepatan':
    case 'melaju_melebihi_batas':
      // Melaju di atas batas kecepatan (misal 95 km/h vs ambang 80 km/h) selama beberapa langkah
      speed = 98.5;
      heading = (currentHeading + 5) % 360;
      lat += 0.0018;
      lng += 0.0015;
      battery = Math.max(20, battery - 0.1);
      break;

    case 'low_battery':
    case 'baterai_rendah':
      // Baterai turun drastis di bawah ambang batas 20%
      battery = Math.max(4, 18 - currentStep * 2.5);
      speed = 22.0;
      lat += (random() - 0.5) * 0.0003;
      lng += (random() - 0.5) * 0.0003;
      break;

    case 'power_cut':
    case 'kabel_daya_diputus':
    case 'daya_terputus':
      // Kabel daya utama aki diputus (indikasi sabotase/pencurian)
      powerCut = true;
      ignition = false;
      speed = 0;
      battery = 45; // baterai cadangan internal
      break;

    case 'unauthorized_movement':
    case 'gerak_tanpa_sewa':
    case 'mesin_menyala_tanpa_sewa':
      // Mesin menyala dan motor bergerak tanpa sewa aktif (> 150m dari markas)
      speed = 46.0;
      heading = 45;
      lat += 0.0020;
      lng += 0.0020;
      battery = 88;
      ignition = true;
      break;

    case 'overdue_return':
    case 'terlambat_kembali':
      // Motor masih bergerak di jalan padahal sudah lewat jadwal kembali
      speed = 38.0;
      lat += 0.0005;
      lng += 0.0005;
      battery = 75;
      ignition = true;
      break;

    case 'data_tertunda':
    case 'no_signal_then_delayed':
      // Sinyal hilang, lalu data yang tertimbun dikirim kembali dengan timestamp masa lampau
      const pastMs = Date.now() - (30 * 60 * 1000) + (currentStep * 10000); // 30 menit lalu
      recordedAt = new Date(pastMs).toISOString();
      speed = 42.0;
      lat += 0.0008;
      lng += 0.0008;
      break;

    case 'offline':
    case 'tidak_ada_sinyal':
      if (currentStep > 2) {
        console.log(`[SIMULATOR] Skenario offline aktif: Pengiriman data dihentikan (Simulasi kehilangan sinyal GPS/jaringan).`);
        process.exit(0);
      }
      lat += 0.0002;
      lng += 0.0002;
      break;

    case 'normal':
    default:
      // Pergerakan dinamis realistis di dalam kota
      const headingDelta = (random() - 0.5) * 20;
      heading = (heading + headingDelta + 360) % 360;
      speed = Math.max(18, Math.min(55, speed + (random() - 0.5) * 6));

      const deltaDeg = (speed / 3600 / 111) * (INTERVAL_MS / 1000);
      const rad = (heading * Math.PI) / 180;
      lat += deltaDeg * Math.cos(rad);
      lng += deltaDeg * Math.sin(rad);
      battery = Math.max(30, battery - 0.03);
      break;
  }

  currentLat = lat;
  currentLng = lng;
  currentHeading = Math.round(heading);
  currentSpeed = Math.round(speed * 10) / 10;
  batteryLevel = Math.round(battery * 10) / 10;

  return {
    externalId: DEVICE_ID,
    motorcycleId: Number(MOTOR_ID),
    provider: 'simulator',
    recordedAt,
    lat: Math.round(lat * 1000000) / 1000000,
    lng: Math.round(lng * 1000000) / 1000000,
    speedKmh: currentSpeed,
    heading: currentHeading,
    accuracyM: 5.2,
    ignition,
    batteryPct: batteryLevel,
    powerCut,
  };
}

async function sendPosition(pos) {
  const payloadStr = JSON.stringify(pos);
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', SECRET).update(`${timestamp}.${payloadStr}`).digest('hex');

  const parsedUrl = new URL(INGEST_URL);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payloadStr),
      'User-Agent': 'RodaKita-GPS-Simulator/1.0',
      'X-Gps-Provider': 'simulator',
      'X-Timestamp': timestamp,
      'X-Gps-Signature': `sha256=${signature}`,
      'X-Gps-Secret': SECRET,
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payloadStr);
    req.end();
  });
}

async function tick() {
  step++;
  const pos = calculateNextPoint(SCENARIO, step);

  try {
    const startTime = Date.now();
    const res = await sendPosition(pos);
    const elapsed = Date.now() - startTime;

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`[Step ${step}] OK (${res.statusCode}) - Lat: ${pos.lat}, Lng: ${pos.lng}, Speed: ${pos.speedKmh} km/h, Bat: ${pos.batteryPct}%, Ignition: ${pos.ignition ? 'ON' : 'OFF'} (${elapsed}ms)`);
    } else {
      console.warn(`[Step ${step}] WARN (${res.statusCode}): ${res.body}`);
    }
  } catch (err) {
    console.error(`[Step ${step}] ERROR Ingest: ${err.message || err.code || err}`);
  }

  if (MAX_STEPS > 0 && step >= MAX_STEPS) {
    console.log(`\n[SIMULATOR] Selesai ${MAX_STEPS} langkah simulasi.`);
    process.exit(0);
  }
}

// Jalankan langkah pertama langsung, kemudian berkala sesuai interval
tick();
const timer = setInterval(tick, INTERVAL_MS);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\n[SIMULATOR] Simulasi dihentikan oleh pengguna.');
  process.exit(0);
});
