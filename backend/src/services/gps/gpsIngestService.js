const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const clock = require('../../utils/clock');
const { registry } = require('./providers');
const { gpsRepo, motorRepo } = require('../../repositories');
const gpsAlertService = require('./gpsAlertService');
const eventBroadcaster = require('../realtime/eventBroadcaster');

// In-memory rate limiter per deviceId: externalId -> { lastRequestTime, countInWindow, windowStart }
const deviceRateLimits = new Map();
// Throttle realtime broadcast: deviceId -> lastBroadcastTime
const deviceBroadcastThrottle = new Map();

class GpsIngestService {
  constructor() {
    this.MAX_FUTURE_DRIFT_MS = 2 * 60 * 1000; // 2 menit toleransi jam GPS di masa depan
    this.MAX_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari batas log lampau
    this.DEVICE_MAX_REQ_PER_SEC = 5; // Batas kecepatan per perangkat
    this.BROADCAST_MIN_INTERVAL_MS = 3000; // gps.position dibatasi 1 pembaruan per 3 detik per perangkat
  }

  /**
   * Reset rate limiter (untuk pengujian)
   */
  resetRateLimits() {
    deviceRateLimits.clear();
    deviceBroadcastThrottle.clear();
  }

  /**
   * Memproses data ingest dari HTTP request
   */
  async processIngest(req) {
    // 1. Tentukan Provider Adapter yang cocok
    const provider = registry.resolveProvider(req);
    if (!provider) {
      throw new AppError('Penyedia GPS tidak dikenali.', 'UNKNOWN_PROVIDER', 400);
    }

    // 2. Verifikasi Autentikasi / HMAC Signature per provider
    let secret = env.GPS_INGEST_SECRET;
    if (provider.name === 'traccar' && env.GPS_TRACCAR_SECRET) {
      secret = env.GPS_TRACCAR_SECRET;
    } else if (provider.name === 'simulator' && env.GPS_SIMULATOR_SECRET) {
      secret = env.GPS_SIMULATOR_SECRET;
    } else if (provider.name === 'generic_webhook' && env.GPS_WEBHOOK_SECRET) {
      secret = env.GPS_WEBHOOK_SECRET;
    }

    const isAuthentic = provider.verifySignature(req.body, req.headers, secret);
    if (!isAuthentic) {
      throw new AppError('Autentikasi penyedia GPS gagal atau signature tidak valid.', 'UNAUTHORIZED_PROVIDER', 401);
    }

    // 3. Parse dan normalisasi payload posisi
    let normalizedPositions;
    try {
      normalizedPositions = provider.parsePayload(req.body, req.headers);
    } catch (parseErr) {
      throw new AppError(`Format data posisi GPS rusak: ${parseErr.message}`, 'MALFORMED_GPS_PAYLOAD', 400);
    }

    if (!Array.isArray(normalizedPositions) || normalizedPositions.length === 0) {
      throw new AppError('Tidak ada data posisi yang dapat diproses.', 'EMPTY_GPS_PAYLOAD', 400);
    }

    // 4. Ingest setiap posisi secara aman dan idempotent
    const results = [];
    for (const pos of normalizedPositions) {
      const res = await this.ingestSinglePosition(pos, provider.name);
      results.push(res);
    }

    return {
      provider: provider.name,
      processed: results.length,
      items: results,
    };
  }

  /**
   * Mengolah satu titik posisi GPS
   */
  async ingestSinglePosition(pos, providerName = 'simulator') {
    const { externalId, recordedAt, lat, lng, speedKmh, heading, accuracyM, ignition, batteryPct, powerCut } = pos;

    // A. Validasi Koordinat Geografis (-90..90 dan -180..180), tolak titik (0,0)
    if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
      throw new AppError(`Latitude di luar rentang valid [-90, 90]: ${lat}`, 'INVALID_LATITUDE', 400);
    }
    if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
      throw new AppError(`Longitude di luar rentang valid [-180, 180]: ${lng}`, 'INVALID_LONGITUDE', 400);
    }
    if (lat === 0 && lng === 0) {
      throw new AppError('Koordinat (0, 0) tidak valid (indikasi kehilangan sinyal GPS).', 'INVALID_COORDINATES', 400);
    }

    // B. Validasi Kecepatan (di bawah 250 km/h)
    const numSpeed = Number(speedKmh || 0);
    if (isNaN(numSpeed) || numSpeed < 0 || numSpeed >= 250) {
      throw new AppError(`Kecepatan tidak masuk akal (${speedKmh} km/h). Harus antara 0 s/d 250 km/h.`, 'INVALID_SPEED', 400);
    }

    // C. Validasi Waktu Posisi (tidak di masa depan > 2 menit, tidak terlalu lampau > 7 hari)
    const posTime = new Date(recordedAt).getTime();
    if (isNaN(posTime)) {
      throw new AppError('Format waktu recordedAt tidak valid.', 'INVALID_TIMESTAMP', 400);
    }

    const now = clock.now().getTime();
    if (posTime > now + this.MAX_FUTURE_DRIFT_MS) {
      throw new AppError('Posisi di masa depan lebih dari 2 menit ditolak.', 'FUTURE_POSITION_REJECTED', 400, {
        recordedAt,
        serverTime: new Date(now).toISOString(),
      });
    }

    if (posTime < now - this.MAX_STALE_AGE_MS) {
      throw new AppError('Posisi sudah terlalu lampau (> 7 hari) ditolak.', 'STALE_POSITION_REJECTED', 400, {
        recordedAt,
      });
    }

    // D. Periksa Perangkat
    let device = await gpsRepo.findDeviceByExternalId(externalId);
    if (!device) {
      // Auto-provisioning khusus simulator / dev environment jika motor belum memiliki tracker
      if (providerName === 'simulator' || env.NODE_ENV !== 'production') {
        device = await this.autoProvisionDeviceForSimulator(externalId);
      }
      
      if (!device) {
        logger.warn(`[GPS] Posisi ditolak: Perangkat dengan external_id "${externalId}" tidak terdaftar.`);
        throw new AppError('Perangkat GPS tidak dikenal atau tidak terdaftar.', 'DEVICE_NOT_FOUND', 404);
      }
    }

    if (!device.isActive) {
      logger.warn(`[GPS] Posisi ditolak: Perangkat "${device.label}" (${device.externalId}) dalam kondisi nonaktif.`);
      throw new AppError('Perangkat GPS nonaktif atau tidak dapat menerima data.', 'DEVICE_INACTIVE', 403);
    }

    // E. Rate Limiting per Perangkat
    this.checkDeviceRateLimit(device.id);

    // F. Simpan Posisi ke Database (Idempotent via UNIQUE(device_id, recorded_at))
    const recorded = await gpsRepo.recordPosition({
      deviceId: device.id,
      recordedAt: new Date(recordedAt).toISOString(),
      lat,
      lng,
      speedKmh: Math.max(0, numSpeed),
      heading: (Number(heading || 0) % 360 + 360) % 360,
      accuracyM: accuracyM !== null && accuracyM !== undefined ? Number(accuracyM) : null,
      ignition: Boolean(ignition),
      batteryPct: batteryPct !== null && batteryPct !== undefined ? Math.min(100, Math.max(0, Number(batteryPct))) : null,
      powerConnected: powerCut === undefined ? true : !powerCut,
      satellites: Number(pos.satellites || 0),
    });

    const isDuplicate = !recorded; // jika null berarti conflict (idempotent duplicate)

    // G. Tangani Urutan Terbalik (Out-of-order Positions)
    // Hanya perbarui status posisi terakhir pada gps_devices BILA posisi baru lebih baru dari yang tersimpan
    const currentLastRecordedTime = device.lastRecordedAt ? new Date(device.lastRecordedAt).getTime() : 0;
    const isNewestPosition = posTime >= currentLastRecordedTime;

    if (isNewestPosition) {
      await gpsRepo.updateDeviceLatestPosition(device.id, {
        lat,
        lng,
        speedKmh: Math.max(0, numSpeed),
        heading: (Number(heading || 0) % 360 + 360) % 360,
        ignition: Boolean(ignition),
        batteryPct: batteryPct !== null && batteryPct !== undefined ? Math.min(100, Math.max(0, Number(batteryPct))) : null,
        powerConnected: powerCut === undefined ? true : !powerCut,
        recordedAt: new Date(recordedAt).toISOString(),
        receivedAt: new Date().toISOString(),
      });

      // H. Pancarkan Peristiwa Realtime (Throttled max 1 pembaruan per 3 detik per perangkat)
      this.broadcastPositionUpdate(device, {
        lat,
        lng,
        speedKmh: numSpeed,
        heading,
        ignition,
        batteryPct,
        powerCut: Boolean(powerCut),
        recordedAt: new Date(recordedAt).toISOString(),
      });
    }

    // I. Evaluasi Mesin Peringatan (Tahap 2) berdasarkan recordedAt (bukan waktu terima)
    try {
      await gpsAlertService.evaluatePosition(device, {
        lat,
        lng,
        speedKmh: numSpeed,
        heading,
        accuracyM: accuracyM !== null && accuracyM !== undefined ? Number(accuracyM) : null,
        ignition: Boolean(ignition),
        batteryPct: batteryPct !== null && batteryPct !== undefined ? Number(batteryPct) : null,
        powerConnected: powerCut === undefined ? true : !powerCut,
        recordedAt: new Date(recordedAt).toISOString(),
      });
    } catch (alertErr) {
      logger.error(`[GPS] Error saat evaluasi peringatan untuk device ${device.id}: ${alertErr.message}`);
    }

    return {
      deviceId: device.id,
      externalId: device.externalId,
      recordedAt: new Date(recordedAt).toISOString(),
      lat,
      lng,
      isDuplicate,
      isNewest: isNewestPosition,
    };
  }

  /**
   * Rate limiting per perangkat (sliding window per detik)
   */
  checkDeviceRateLimit(deviceId) {
    const now = Date.now();
    let limiter = deviceRateLimits.get(deviceId);

    if (!limiter || now - limiter.windowStart >= 1000) {
      limiter = { windowStart: now, count: 1 };
      deviceRateLimits.set(deviceId, limiter);
      return;
    }

    limiter.count++;
    if (limiter.count > this.DEVICE_MAX_REQ_PER_SEC) {
      throw new AppError(
        `Frekuensi pengiriman data untuk perangkat GPS ${deviceId} melebihi batas (${this.DEVICE_MAX_REQ_PER_SEC} req/dtk).`,
        'DEVICE_RATE_LIMIT_EXCEEDED',
        429
      );
    }
  }

  /**
   * Penyiaran realtime posisi ke admin/staff (dibatasi 1 pembaruan per 3 detik per perangkat)
   */
  broadcastPositionUpdate(device, posData) {
    const now = Date.now();
    const lastBroadcast = deviceBroadcastThrottle.get(device.id) || 0;

    if (now - lastBroadcast < this.BROADCAST_MIN_INTERVAL_MS) {
      return; // Throttled
    }

    deviceBroadcastThrottle.set(device.id, now);

    eventBroadcaster.broadcast({
      type: 'gps.position',
      entityId: String(device.id),
      userId: null, // Khusus admin/staff
      version: 1,
      payload: {
        deviceId: device.id,
        motorcycleId: device.motorcycleId,
        externalId: device.externalId,
        label: device.label,
        lat: posData.lat,
        lng: posData.lng,
        speedKmh: posData.speedKmh,
        heading: posData.heading,
        ignition: posData.ignition,
        batteryPct: posData.batteryPct,
        powerCut: posData.powerCut,
        recordedAt: posData.recordedAt,
      },
    });
  }

  /**
   * Auto-provisioning perangkat untuk simulator jika motor ada tapi belum dipasangkan device
   */
  async autoProvisionDeviceForSimulator(externalId) {
    try {
      const motorsRes = await motorRepo.findAll({}, { limit: 10, offset: 0 });
      const motors = Array.isArray(motorsRes) ? motorsRes : motorsRes.data;

      // Cari motor yang belum punya device
      for (const motor of motors) {
        const existing = await gpsRepo.findDeviceByMotorcycleId(motor.id);
        if (!existing) {
          logger.info(`[GPS] Auto-provisioning tracker simulator ${externalId} untuk motor ${motor.name} (ID: ${motor.id})`);
          return await gpsRepo.createDevice({
            motorcycleId: motor.id,
            provider: 'simulator',
            externalId: String(externalId),
            label: `GPS Tracker ${motor.name}`,
            isActive: true,
            batteryPct: 100,
          });
        }
      }
    } catch (err) {
      logger.warn('[GPS] Gagal auto-provision tracker:', err.message);
    }
    return null;
  }
}

module.exports = new GpsIngestService();
