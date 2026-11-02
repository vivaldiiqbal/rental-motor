const { gpsRepo, bookingRepo, maintenanceRepo, settingsRepo } = require('../../repositories');
const { haversineDistance, isPointInGeofence } = require('../../utils/geo');
const eventBroadcaster = require('../realtime/eventBroadcaster');
const logger = require('../../utils/logger');

// Cache in-memory untuk tracking histeresis dan derau
const overspeedCounters = new Map(); // deviceId -> count consecutive
const outOfBoundsCounters = new Map(); // deviceId -> count consecutive
const lastKnownDistances = new Map(); // deviceId -> { lat, lng }

class GpsAlertService {
  /**
   * Evaluasi komprehensif atas posisi baru yang masuk berdasarkan recordedAt (bukan waktu terima).
   * @param {object} device
   * @param {object} posData
   */
  async evaluatePosition(device, posData) {
    if (!device || !posData) return;

    try {
      const settings = await settingsRepo.getSettings();
      const speedLimit = Number(settings['gps.speed_limit_kmh'] || 80);
      const lowBatteryPct = Number(settings['gps.low_battery_pct'] || 20);
      const unauthorizedMeters = Number(settings['gps.unauthorized_move_meters'] || 150);
      const overdueGraceMinutes = Number(settings['gps.overdue_grace_minutes'] || 30);

      // Sinyal posisi diterima -> otomatis selesaikan alert offline jika sebelumnya ada
      await this.autoResolveOffline(device.id);

      // 1. Noise Filtering (Derau GPS):
      // Jika akurasi lebih buruk dari 100 meter, abaikan sampel untuk evaluasi area
      const isAccurate = posData.accuracyM === null || posData.accuracyM <= 100;

      // Filter pergeseran kecil saat diam (drift < 15 meter saat mesin mati dan speed 0)
      const prevPos = lastKnownDistances.get(device.id);
      let isStationaryDrift = false;
      if (prevPos && Number(posData.speedKmh || 0) === 0 && !posData.ignition) {
        const driftDist = haversineDistance(prevPos.lat, prevPos.lng, posData.lat, posData.lng);
        if (driftDist < 15) {
          isStationaryDrift = true;
        }
      }
      lastKnownDistances.set(device.id, { lat: posData.lat, lng: posData.lng });

      // 2. Cari booking aktif untuk motor ini (jika ada)
      const activeBooking = await this.findActiveBookingForMotor(device.motorcycleId, posData.recordedAt);
      const bookingId = activeBooking ? activeBooking.id : null;

      // 3. Evaluasi Kecepatan (Speeding): sedikitnya 3 sampel berturut-turut melebihi batas
      await this.evaluateSpeed(device, posData, speedLimit, bookingId);

      // 4. Evaluasi Baterai Rendah & Daya Terputus
      await this.evaluateBatteryAndPower(device, posData, lowBatteryPct, bookingId);

      // 5. Evaluasi Geofencing (Keluar Area & Masuk Area Terlarang) - hanya jika sinyal akurat
      if (isAccurate) {
        await this.evaluateGeofences(device, posData, activeBooking);
      }

      // 6. Evaluasi Gerak Tanpa Sewa (Theft Indication) - bila tidak ada sewa aktif dan bukan drift saat diam
      if (!isStationaryDrift) {
        await this.evaluateUnauthorizedMovement(device, posData, activeBooking, unauthorizedMeters);
      }

      // 7. Evaluasi Terlambat Kembali (Overdue Return)
      if (activeBooking) {
        await this.evaluateOverdueReturn(device, posData, activeBooking, overdueGraceMinutes);
      }
    } catch (err) {
      logger.error(`[GPS ALERT] Gagal mengevaluasi posisi untuk perangkat ${device.id}: ${err.message}`);
    }
  }

  /**
   * Cari booking yang sedang berjalan untuk motor tertentu pada waktu recordedAt
   */
  async findActiveBookingForMotor(motorcycleId, recordedAt) {
    if (!motorcycleId) return null;
    try {
      const res = await bookingRepo.findAll({ motorId: Number(motorcycleId), status: 'active' }, { limit: 10 });
      const items = Array.isArray(res) ? res : res.data;
      if (!items || items.length === 0) return null;

      const recTime = new Date(recordedAt).getTime();

      // Pilih booking yang sedang dalam rentang sewa
      for (const b of items) {
        const sTime = new Date(b.startDate || b.start_date).getTime();
        const eTime = new Date(b.endDate || b.end_date).getTime() + 24 * 60 * 60 * 1000; // sampai akhir hari
        if (recTime >= sTime && recTime <= eTime + 7 * 24 * 60 * 60 * 1000) {
          return b;
        }
      }
      return items[0]; // fallback ke active booking yang ada
    } catch {
      return null;
    }
  }

  /**
   * 3. Evaluasi Kecepatan (Histeresis 3 sampel berturut-turut)
   */
  async evaluateSpeed(device, posData, speedLimit, bookingId) {
    const currentSpeed = Number(posData.speedKmh || 0);
    const counter = overspeedCounters.get(device.id) || 0;

    if (currentSpeed > speedLimit) {
      const nextCount = counter + 1;
      overspeedCounters.set(device.id, nextCount);

      if (nextCount >= 3) {
        const alert = await gpsRepo.createOrIncrementAlert({
          deviceId: device.id,
          motorcycleId: device.motorcycleId,
          bookingId,
          type: 'kecepatan',
          severity: 'warning',
          details: {
            speedKmh: currentSpeed,
            speedLimit,
            consecutiveSamples: nextCount,
            recordedAt: posData.recordedAt,
          },
          dedupeKey: `kecepatan:${device.id}`,
        });

        this.broadcastAlert(alert);
      }
    } else {
      overspeedCounters.set(device.id, 0);
      const resolved = await gpsRepo.resolveAlertsByDedupeKey(
        `kecepatan:${device.id}`,
        'Kecepatan motor telah kembali di bawah batas normal.'
      );
      if (resolved && resolved.length > 0) {
        this.broadcastAlert(resolved[0], 'alert_resolved');
      }
    }
  }

  /**
   * 4. Evaluasi Baterai Rendah & Daya Terputus
   */
  async evaluateBatteryAndPower(device, posData, lowBatteryPct, bookingId) {
    // A. Baterai Rendah
    if (posData.batteryPct !== null && posData.batteryPct !== undefined) {
      const bat = Number(posData.batteryPct);
      if (bat < lowBatteryPct) {
        const alert = await gpsRepo.createOrIncrementAlert({
          deviceId: device.id,
          motorcycleId: device.motorcycleId,
          bookingId,
          type: 'baterai_rendah',
          severity: 'warning',
          details: {
            batteryPct: bat,
            threshold: lowBatteryPct,
            recordedAt: posData.recordedAt,
          },
          dedupeKey: `baterai_rendah:${device.id}`,
        });
        this.broadcastAlert(alert);
      } else if (bat >= lowBatteryPct + 5) {
        // Histeresis pulih bila baterai naik 5% di atas ambang
        const resolved = await gpsRepo.resolveAlertsByDedupeKey(
          `baterai_rendah:${device.id}`,
          'Baterai telah terisi kembali di atas ambang batas.'
        );
        if (resolved && resolved.length > 0) {
          this.broadcastAlert(resolved[0], 'alert_resolved');
        }
      }
    }

    // B. Daya Terputus (Power Disconnected) -> Severity High
    if (posData.powerConnected === false && device.lastPowerConnected !== false) {
      const alert = await gpsRepo.createOrIncrementAlert({
        deviceId: device.id,
        motorcycleId: device.motorcycleId,
        bookingId,
        type: 'daya_terputus',
        severity: 'high',
        details: {
          recordedAt: posData.recordedAt,
          reason: 'Koneksi daya utama dari aki terputus.',
        },
        dedupeKey: `daya_terputus:${device.id}`,
      });
      this.broadcastAlert(alert);
    } else if (posData.powerConnected === true) {
      const resolved = await gpsRepo.resolveAlertsByDedupeKey(
        `daya_terputus:${device.id}`,
        'Koneksi daya utama kembali terhubung.'
      );
      if (resolved && resolved.length > 0) {
        this.broadcastAlert(resolved[0], 'alert_resolved');
      }
    }
  }

  /**
   * 5. Evaluasi Geofencing: Keluar Area & Masuk Area Terlarang
   */
  async evaluateGeofences(device, posData, activeBooking) {
    const geofences = await gpsRepo.listGeofences({ isActive: true });
    if (!geofences || geofences.length === 0) return;

    // Filter geofence yang berlaku untuk motor ini
    const applicable = geofences.filter(
      (g) => g.appliesToAll || (Array.isArray(g.motorcycleIds) && g.motorcycleIds.includes(device.motorcycleId))
    );

    // 5.1 Masuk Area Terlarang (forbidden area) -> Severity High
    const forbiddenAreas = applicable.filter((g) => g.kind === 'forbidden');
    for (const fArea of forbiddenAreas) {
      const isInside = isPointInGeofence(posData, fArea, 0);
      if (isInside) {
        const alert = await gpsRepo.createOrIncrementAlert({
          deviceId: device.id,
          motorcycleId: device.motorcycleId,
          bookingId: activeBooking ? activeBooking.id : null,
          type: 'masuk_area_terlarang',
          severity: 'high',
          details: {
            geofenceId: fArea.id,
            geofenceName: fArea.name,
            lat: posData.lat,
            lng: posData.lng,
            recordedAt: posData.recordedAt,
          },
          dedupeKey: `masuk_area_terlarang:${device.id}:${fArea.id}`,
        });
        this.broadcastAlert(alert);
      } else {
        const resolved = await gpsRepo.resolveAlertsByDedupeKey(
          `masuk_area_terlarang:${device.id}:${fArea.id}`,
          `Motor telah keluar dari area terlarang (${fArea.name}).`
        );
        if (resolved && resolved.length > 0) {
          this.broadcastAlert(resolved[0], 'alert_resolved');
        }
      }
    }

    // 5.2 Keluar Area Boleh Pakai (allowed area) saat ada booking berjalan
    // Histeresis: 2 sampel berturut-turut di luar area dan margin 30 meter
    if (activeBooking) {
      const allowedAreas = applicable.filter((g) => g.kind === 'allowed');
      if (allowedAreas.length > 0) {
        // Cek apakah di dalam salah satu allowed area dengan margin 30m
        const isInsideAnyAllowed = allowedAreas.some((g) => isPointInGeofence(posData, g, 30));
        const outCount = outOfBoundsCounters.get(device.id) || 0;

        if (!isInsideAnyAllowed) {
          const nextOutCount = outCount + 1;
          outOfBoundsCounters.set(device.id, nextOutCount);

          if (nextOutCount >= 2) {
            const alert = await gpsRepo.createOrIncrementAlert({
              deviceId: device.id,
              motorcycleId: device.motorcycleId,
              bookingId: activeBooking.id,
              type: 'keluar_area',
              severity: 'warning',
              details: {
                lat: posData.lat,
                lng: posData.lng,
                consecutiveSamples: nextOutCount,
                recordedAt: posData.recordedAt,
                allowedAreasCount: allowedAreas.length,
              },
              dedupeKey: `keluar_area:${device.id}:${activeBooking.id}`,
            });
            this.broadcastAlert(alert);
          }
        } else {
          outOfBoundsCounters.set(device.id, 0);
          const resolved = await gpsRepo.resolveAlertsByDedupeKey(
            `keluar_area:${device.id}:${activeBooking.id}`,
            'Motor telah kembali ke dalam area sewa yang diizinkan.'
          );
          if (resolved && resolved.length > 0) {
            this.broadcastAlert(resolved[0], 'alert_resolved');
          }
        }
      }
    }
  }

  /**
   * 6. Evaluasi Gerak Tanpa Sewa (Indikasi Pencurian -> Severity High)
   */
  async evaluateUnauthorizedMovement(device, posData, activeBooking, unauthorizedMeters) {
    if (activeBooking) {
      // Ada sewa aktif, tidak memicu pencurian
      const resolved = await gpsRepo.resolveAlertsByDedupeKey(
        `gerak_tanpa_sewa:${device.id}`,
        'Status sewa motor telah aktif.'
      );
      if (resolved && resolved.length > 0) {
        this.broadcastAlert(resolved[0], 'alert_resolved');
      }
      return;
    }

    // Cek apakah motor sedang dalam blok servis / bengkel
    try {
      const activeMaint = await maintenanceRepo.listMaintenance({
        motorId: Number(device.motorcycleId),
        status: 'in_progress',
      });
      const maintList = Array.isArray(activeMaint) ? activeMaint : activeMaint.data;
      if (maintList && maintList.length > 0) {
        // Abaikan motor dalam servis
        return;
      }
    } catch {
      // ignore
    }

    // Temukan area markas (garage)
    const geofences = await gpsRepo.listGeofences({ isActive: true });
    const garageArea = (geofences || []).find((g) => g.kind === 'garage');

    let isOutsideGarage = false;
    let distFromBase = 0;

    if (garageArea) {
      isOutsideGarage = !isPointInGeofence(posData, garageArea, unauthorizedMeters);
      const centerLat = garageArea.centerLat ?? garageArea.geometry?.center?.lat ?? -8.670458;
      const centerLng = garageArea.centerLng ?? garageArea.geometry?.center?.lng ?? 115.212629;
      distFromBase = haversineDistance(posData.lat, posData.lng, centerLat, centerLng);
    } else {
      // Titik dasar default Denpasar / Bali
      distFromBase = haversineDistance(posData.lat, posData.lng, -8.670458, 115.212629);
      isOutsideGarage = distFromBase > unauthorizedMeters;
    }

    const isMovingOrIgnited = Boolean(posData.ignition) || Number(posData.speedKmh || 0) > 5;

    if (isOutsideGarage && isMovingOrIgnited) {
      const alert = await gpsRepo.createOrIncrementAlert({
        deviceId: device.id,
        motorcycleId: device.motorcycleId,
        bookingId: null,
        type: 'gerak_tanpa_sewa',
        severity: 'high',
        details: {
          lat: posData.lat,
          lng: posData.lng,
          speedKmh: posData.speedKmh,
          ignition: posData.ignition,
          distanceFromGarageM: Math.round(distFromBase),
          recordedAt: posData.recordedAt,
        },
        dedupeKey: `gerak_tanpa_sewa:${device.id}`,
      });
      this.broadcastAlert(alert);
    } else if (!isOutsideGarage && !posData.ignition && Number(posData.speedKmh || 0) === 0) {
      const resolved = await gpsRepo.resolveAlertsByDedupeKey(
        `gerak_tanpa_sewa:${device.id}`,
        'Motor telah kembali ke markas dan mesin mati.'
      );
      if (resolved && resolved.length > 0) {
        this.broadcastAlert(resolved[0], 'alert_resolved');
      }
    }
  }

  /**
   * 7. Evaluasi Terlambat Kembali (Overdue Return)
   */
  async evaluateOverdueReturn(device, posData, activeBooking, overdueGraceMinutes) {
    if (!activeBooking || !activeBooking.endDate) return;

    try {
      const returnDateStr = `${activeBooking.endDate}T21:00:00.000Z`;
      const returnTimeMs = new Date(returnDateStr).getTime();
      const gracePeriodMs = overdueGraceMinutes * 60 * 1000;
      const currentPosTime = new Date(posData.recordedAt).getTime();

      if (currentPosTime > returnTimeMs + gracePeriodMs) {
        const diffMinutes = Math.round((currentPosTime - returnTimeMs) / 60000);
        const alert = await gpsRepo.createOrIncrementAlert({
          deviceId: device.id,
          motorcycleId: device.motorcycleId,
          bookingId: activeBooking.id,
          type: 'terlambat_kembali',
          severity: 'high',
          details: {
            bookingCode: activeBooking.bookingCode,
            customerName: activeBooking.customerName,
            customerPhone: activeBooking.customerPhone,
            scheduledReturn: returnDateStr,
            overdueMinutes: diffMinutes,
            lastLat: posData.lat,
            lastLng: posData.lng,
            speedKmh: posData.speedKmh,
            recordedAt: posData.recordedAt,
          },
          dedupeKey: `terlambat_kembali:${activeBooking.id}`,
        });
        this.broadcastAlert(alert);
      }
    } catch (err) {
      logger.warn(`[GPS ALERT] Error evaluateOverdueReturn: ${err.message}`);
    }
  }

  /**
   * Periksa perangkat yang offline (dijalankan berkala tiap menit)
   */
  async checkOfflineDevices() {
    try {
      const settings = await settingsRepo.getSettings();
      const offlineMinutes = Number(settings['gps.offline_minutes'] || 15);
      const devicesRes = await gpsRepo.listDevices({ isActive: true }, { limit: 1000 });
      const devices = Array.isArray(devicesRes) ? devicesRes : devicesRes.data;

      const now = Date.now();
      const offlineMs = offlineMinutes * 60 * 1000;

      for (const dev of devices) {
        const lastSeen = dev.lastSeenAt ? new Date(dev.lastSeenAt).getTime() : (dev.installedAt ? new Date(dev.installedAt).getTime() : 0);
        if (now - lastSeen > offlineMs) {
          const alert = await gpsRepo.createOrIncrementAlert({
            deviceId: dev.id,
            motorcycleId: dev.motorcycleId,
            type: 'offline',
            severity: 'warning',
            details: {
              lastSeenAt: dev.lastSeenAt,
              offlineMinutes: Math.round((now - lastSeen) / 60000),
              thresholdMinutes: offlineMinutes,
            },
            dedupeKey: `offline:${dev.id}`,
          });
          this.broadcastAlert(alert);
        }
      }
    } catch (err) {
      logger.error(`[GPS ALERT] Gagal menjalankan checkOfflineDevices: ${err.message}`);
    }
  }

  /**
   * Selesaikan alert offline saat perangkat kembali online
   */
  async autoResolveOffline(deviceId) {
    const resolved = await gpsRepo.resolveAlertsByDedupeKey(
      `offline:${deviceId}`,
      'Perangkat kembali online dan mengirim sinyal posisi GPS.'
    );
    if (resolved && resolved.length > 0) {
      this.broadcastAlert(resolved[0], 'alert_resolved');
    }
  }

  /**
   * Pancarkan alert ke antarmuka admin/staff via Server-Sent Events (SSE)
   */
  broadcastAlert(alert, action = 'alert_triggered') {
    if (!alert) return;

    eventBroadcaster.broadcast({
      type: 'gps.alert',
      entityId: String(alert.id),
      userId: null, // Khusus staff dan admin
      version: 1,
      payload: {
        action,
        alert,
      },
    });

    eventBroadcaster.broadcast({
      type: 'counters.changed',
      entityId: 'gps_alerts',
      userId: null,
      version: 1,
      payload: { type: 'gps_alert', count: 1 },
    });
  }
}

module.exports = new GpsAlertService();
