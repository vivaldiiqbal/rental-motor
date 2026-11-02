const { gpsRepo, motorRepo, bookingRepo, settingsRepo, auditRepo } = require('../../repositories');
const { simplifyRouteRDP, detectStops } = require('../../utils/geo');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

class GpsAdminService {
  /**
   * GET /live: Seluruh perangkat dengan snapshot posisi terakhir, status online/offline,
   * booking aktif, dan jumlah alert terbuka.
   */
  async getLiveDevices(actor, reqContext = {}) {
    const settings = await settingsRepo.getSettings();
    const offlineMinutes = Number(settings['gps.offline_minutes'] || 15);
    const now = Date.now();

    // Catat ke gps_access_log
    await gpsRepo.recordAccessLog({
      userId: actor.id,
      action: 'lihat_live',
      motorcycleId: null,
      timeRange: null,
      ip: reqContext.ip || null,
    });

    const [devicesRes, geofences, activeBookingsRes] = await Promise.all([
      gpsRepo.listDevices({}, { limit: 500, offset: 0 }),
      gpsRepo.listGeofences({ isActive: true }),
      bookingRepo.findAll({ status: 'active' }, { limit: 500, page: 1 }),
    ]);

    const devices = Array.isArray(devicesRes) ? devicesRes : (devicesRes.data || []);
    const activeBookings = Array.isArray(activeBookingsRes) ? activeBookingsRes : (activeBookingsRes.items || activeBookingsRes.data || []);

    // Petakan active booking per motorId
    const bookingByMotorId = new Map();
    for (const b of activeBookings) {
      bookingByMotorId.set(Number(b.motorcycleId || b.motorId), b);
    }

    const items = [];
    for (const dev of devices) {
      const lastSeen = dev.lastSeenAt ? new Date(dev.lastSeenAt).getTime() : 0;
      const isOnline = Boolean(dev.isActive && (now - lastSeen <= offlineMinutes * 60 * 1000));
      const minutesAgo = lastSeen > 0 ? Math.round((now - lastSeen) / 60000) : null;

      // Cari booking aktif
      const activeBooking = bookingByMotorId.get(Number(dev.motorcycleId));
      let bookingSummary = null;
      if (activeBooking) {
        bookingSummary = {
          id: activeBooking.id,
          bookingCode: activeBooking.bookingCode,
          customerName: activeBooking.customerName,
          customerPhone: activeBooking.customerPhone,
          startDate: activeBooking.startDate,
          endDate: activeBooking.endDate,
          scheduledReturn: activeBooking.endDate ? `${activeBooking.endDate}T21:00:00` : null,
        };
      }

      // Hitung alert terbuka untuk device ini
      const alertsRes = await gpsRepo.listAlerts({ deviceId: dev.id, isOpenOnly: true }, { limit: 100 });
      const openAlerts = Array.isArray(alertsRes) ? alertsRes : (alertsRes.data || []);
      const hasHighAlert = openAlerts.some((a) => a.severity === 'high');

      items.push({
        id: dev.id,
        motorcycleId: dev.motorcycleId,
        motorcycleName: dev.motorcycleName,
        plateNumber: dev.plateNumber,
        brand: dev.brand,
        motorcycleStatus: dev.motorcycleStatus,
        label: dev.label,
        externalId: dev.externalId,
        provider: dev.provider,
        isActive: dev.isActive,
        isOnline,
        minutesAgo,
        batteryPct: dev.lastBatteryPct !== null ? dev.lastBatteryPct : dev.batteryPct,
        speedKmh: dev.lastSpeedKmh || 0,
        heading: dev.lastHeading || 0,
        ignition: dev.lastIgnition || false,
        powerConnected: dev.lastPowerConnected !== false,
        lastLat: dev.lastLat,
        lastLng: dev.lastLng,
        lastRecordedAt: dev.lastRecordedAt,
        lastSeenAt: dev.lastSeenAt,
        installedAt: dev.installedAt,
        activeBooking: bookingSummary,
        openAlertsCount: openAlerts.length,
        hasHighAlert,
        alerts: openAlerts.slice(0, 5),
      });
    }

    return {
      devices: items,
      geofences,
      total: items.length,
      onlineCount: items.filter((d) => d.isOnline).length,
      offlineCount: items.filter((d) => !d.isOnline).length,
      rentedCount: items.filter((d) => d.activeBooking).length,
      alertsCount: items.filter((d) => d.openAlertsCount > 0).length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /motorcycles/:id/positions: Riwayat rute motor.
   * Batas staf: gps.history_max_days_staff (7 hari), admin: gps.retention_days (90 hari).
   * Maksimal 2000 titik, RDP route simplification, dan penanda perhentian (diam > 5 menit).
   */
  async getMotorcyclePositions(motorcycleId, query = {}, actor, reqContext = {}) {
    const motor = await motorRepo.findById(motorcycleId);
    if (!motor) {
      throw new AppError('Data motor tidak ditemukan.', 'MOTORCYCLE_NOT_FOUND', 404);
    }

    const device = await gpsRepo.findDeviceByMotorcycleId(motorcycleId);
    if (!device) {
      return {
        motorcycleId: Number(motorcycleId),
        motorcycleName: motor.name,
        plateNumber: motor.plateNumber,
        device: null,
        positions: [],
        stops: [],
        total: 0,
      };
    }

    const settings = await settingsRepo.getSettings();
    const historyMaxStaff = Number(settings['gps.history_max_days_staff'] || 7);
    const retentionDays = Number(settings['gps.retention_days'] || 90);

    const now = Date.now();
    const maxAllowedDays = actor.role === 'staff' ? historyMaxStaff : retentionDays;
    const earliestAllowedTime = now - maxAllowedDays * 24 * 60 * 60 * 1000;

    let fromDate = query.from ? new Date(query.from) : new Date(now - 24 * 60 * 60 * 1000);
    let toDate = query.to ? new Date(query.to) : new Date(now);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new AppError('Format tanggal rentang waktu tidak valid.', 'INVALID_DATE_RANGE', 400);
    }

    // Periksa batasan peran staff vs admin
    if (fromDate.getTime() < earliestAllowedTime) {
      if (actor.role === 'staff') {
        throw new AppError(
          `Staff dibatasi melihat riwayat maksimal ${historyMaxStaff} hari terakhir. Hubungi Admin untuk melihat riwayat lebih lama.`,
          'ROLE_HISTORY_LIMIT_EXCEEDED',
          403
        );
      }
      fromDate = new Date(earliestAllowedTime);
    }

    // Catat ke gps_access_log
    await gpsRepo.recordAccessLog({
      userId: actor.id,
      action: 'lihat_riwayat',
      motorcycleId: Number(motorcycleId),
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      ip: reqContext.ip || null,
    });

    const rawPositions = await gpsRepo.getPositionsHistory(device.id, fromDate, toDate, 2000);

    // Deteksi titik perhentian (diam > 5 menit)
    const stops = detectStops(rawPositions, 5);

    // Penyederhanaan rute jika titik cukup padat (> 500 titik)
    let processedPositions = rawPositions;
    if (rawPositions.length > 500) {
      processedPositions = simplifyRouteRDP(rawPositions, 5);
    }

    return {
      motorcycleId: Number(motorcycleId),
      motorcycleName: motor.name,
      plateNumber: motor.plateNumber,
      device: {
        id: device.id,
        label: device.label,
        externalId: device.externalId,
        provider: device.provider,
      },
      positions: processedPositions,
      stops,
      total: rawPositions.length,
      simplifiedTotal: processedPositions.length,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }

  /**
   * GET /alerts: Daftar peringatan GPS
   */
  async listAlerts(query = {}) {
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.severity) filter.severity = query.severity;
    if (query.type) filter.type = query.type;
    if (query.motorcycleId) filter.motorcycleId = query.motorcycleId;
    if (query.isOpenOnly === 'true' || query.isOpenOnly === true) filter.isOpenOnly = true;

    const paging = {
      page: Math.max(1, parseInt(query.page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20)),
    };
    paging.offset = (paging.page - 1) * paging.limit;

    return await gpsRepo.listAlerts(filter, paging);
  }

  /**
   * PATCH /alerts/:id/acknowledge
   */
  async acknowledgeAlert(alertId, actor, reqContext = {}) {
    const alert = await gpsRepo.findAlertById(alertId);
    if (!alert) {
      throw new AppError('Peringatan GPS tidak ditemukan.', 'ALERT_NOT_FOUND', 404);
    }

    if (alert.status !== 'open') {
      return alert; // Idempotent jika sudah acknowledged/resolved
    }

    const updated = await gpsRepo.acknowledgeAlert(alertId, actor.id);

    // Audit log
    await auditRepo.record({
      userId: actor.id,
      action: 'gps_alert_acknowledge',
      entity: 'gps_alerts',
      entityId: String(alertId),
      details: { previousStatus: alert.status, newStatus: 'acknowledged' },
      ip: reqContext.ip || null,
    });

    return updated;
  }

  /**
   * PATCH /alerts/:id/resolve (Catatan wajib sesuai PRD)
   */
  async resolveAlert(alertId, payload = {}, actor, reqContext = {}) {
    const alert = await gpsRepo.findAlertById(alertId);
    if (!alert) {
      throw new AppError('Peringatan GPS tidak ditemukan.', 'ALERT_NOT_FOUND', 404);
    }

    const note = (payload.note || payload.resolvedNote || '').trim();
    if (!note) {
      throw new AppError('Catatan penyelesaian peringatan wajib diisi.', 'RESOLVE_NOTE_REQUIRED', 400);
    }

    const updated = await gpsRepo.resolveAlert(alertId, note, actor.id);

    // Audit log
    await auditRepo.record({
      userId: actor.id,
      action: 'gps_alert_resolve',
      entity: 'gps_alerts',
      entityId: String(alertId),
      details: { previousStatus: alert.status, newStatus: 'resolved', note },
      ip: reqContext.ip || null,
    });

    return updated;
  }

  // ==========================================
  // KHUSUS ADMIN (CRUD DEVICES, GEOFENCES, SETTINGS, ACCESS LOG)
  // ==========================================

  async listDevices(query = {}) {
    const filter = {};
    if (query.search) filter.search = query.search;
    if (query.provider) filter.provider = query.provider;
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true' || query.isActive === true;

    const paging = {
      page: Math.max(1, parseInt(query.page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50)),
    };
    paging.offset = (paging.page - 1) * paging.limit;

    return await gpsRepo.listDevices(filter, paging);
  }

  async createDevice(payload = {}, actor, reqContext = {}) {
    const { motorcycleId, provider = 'simulator', externalId, label } = payload;

    if (!motorcycleId || !externalId || !label) {
      throw new AppError('motorcycleId, externalId, dan label wajib diisi.', 'MISSING_REQUIRED_FIELDS', 400);
    }

    const motor = await motorRepo.findById(motorcycleId);
    if (!motor) {
      throw new AppError('Data motor tidak ditemukan.', 'MOTORCYCLE_NOT_FOUND', 404);
    }

    // Pastikan motor belum memiliki perangkat aktif
    const existing = await gpsRepo.findDeviceByMotorcycleId(motorcycleId);
    if (existing) {
      throw new AppError(
        `Motor "${motor.name}" (${motor.plateNumber}) sudah memiliki perangkat GPS terpasang (${existing.label} - ${existing.externalId}). Gunakan fitur Ganti Perangkat jika ingin mengganti.`,
        'MOTORCYCLE_ALREADY_HAS_DEVICE',
        409
      );
    }

    // Pastikan externalId unik
    const existingExt = await gpsRepo.findDeviceByExternalId(externalId);
    if (existingExt) {
      throw new AppError(`Perangkat dengan external_id "${externalId}" sudah terdaftar.`, 'DEVICE_EXTERNAL_ID_EXISTS', 409);
    }

    const device = await gpsRepo.createDevice({
      motorcycleId: Number(motorcycleId),
      provider,
      externalId: String(externalId).trim(),
      label: String(label).trim(),
      isActive: payload.isActive !== false,
      batteryPct: payload.batteryPct !== undefined ? Number(payload.batteryPct) : null,
    });

    await auditRepo.record({
      userId: actor.id,
      action: 'gps_device_create',
      entity: 'gps_devices',
      entityId: String(device.id),
      details: { motorcycleId, externalId, label, provider },
      ip: reqContext.ip || null,
    });

    return device;
  }

  async updateDevice(deviceId, payload = {}, actor, reqContext = {}) {
    const device = await gpsRepo.findDeviceById(deviceId);
    if (!device) {
      throw new AppError('Perangkat GPS tidak ditemukan.', 'DEVICE_NOT_FOUND', 404);
    }

    const patch = {};
    if (payload.label !== undefined) patch.label = String(payload.label).trim();
    if (payload.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
    if (payload.provider !== undefined) patch.provider = String(payload.provider);

    const updated = await gpsRepo.updateDevice(deviceId, patch);

    await auditRepo.record({
      userId: actor.id,
      action: 'gps_device_update',
      entity: 'gps_devices',
      entityId: String(deviceId),
      details: { changes: patch },
      ip: reqContext.ip || null,
    });

    return updated;
  }

  /**
   * Ganti perangkat dengan riwayat tetap:
   * Menandai perangkat lama nonaktif, mendaftarkan perangkat baru pada motor yang sama.
   */
  async replaceDevice(oldDeviceId, payload = {}, actor, reqContext = {}) {
    const oldDevice = await gpsRepo.findDeviceById(oldDeviceId);
    if (!oldDevice) {
      throw new AppError('Perangkat GPS lama tidak ditemukan.', 'DEVICE_NOT_FOUND', 404);
    }

    const { newExternalId, newLabel, provider = oldDevice.provider } = payload;
    if (!newExternalId || !newLabel) {
      throw new AppError('newExternalId dan newLabel wajib diisi.', 'MISSING_REQUIRED_FIELDS', 400);
    }

    // Nonaktifkan device lama dan lepas motorcycleId agar UNIQUE tidak terlanggar
    await gpsRepo.updateDevice(oldDeviceId, { isActive: false, label: `${oldDevice.label} (Digantikan)` });

    // Buat device baru
    const newDevice = await gpsRepo.createDevice({
      motorcycleId: oldDevice.motorcycleId,
      provider,
      externalId: String(newExternalId).trim(),
      label: String(newLabel).trim(),
      isActive: true,
      batteryPct: 100,
    });

    await auditRepo.record({
      userId: actor.id,
      action: 'gps_device_replace',
      entity: 'gps_devices',
      entityId: String(newDevice.id),
      details: {
        oldDeviceId,
        oldExternalId: oldDevice.externalId,
        newDeviceId: newDevice.id,
        newExternalId,
        motorcycleId: oldDevice.motorcycleId,
      },
      ip: reqContext.ip || null,
    });

    return newDevice;
  }

  // GEOFENCES
  async listGeofences(query = {}) {
    return await gpsRepo.listGeofences(query);
  }

  async createGeofence(payload = {}, actor, reqContext = {}) {
    const { name, kind = 'allowed', shape = 'circle', centerLat, centerLng, radiusM, polygon, appliesToAll = true, motorcycleIds = [] } = payload;

    if (!name) {
      throw new AppError('Nama area geofence wajib diisi.', 'NAME_REQUIRED', 400);
    }

    if (!['allowed', 'garage', 'forbidden'].includes(kind)) {
      throw new AppError('Jenis area geofence harus salah satu dari: allowed, garage, forbidden.', 'INVALID_GEOFENCE_KIND', 400);
    }

    if (!['circle', 'polygon'].includes(shape)) {
      throw new AppError('Bentuk geofence harus circle atau polygon.', 'INVALID_GEOFENCE_SHAPE', 400);
    }

    if (shape === 'circle') {
      if (centerLat === undefined || centerLng === undefined || radiusM === undefined) {
        throw new AppError('Geofence lingkaran wajib menyertakan centerLat, centerLng, dan radiusM.', 'INVALID_CIRCLE_DATA', 400);
      }
    } else if (shape === 'polygon') {
      if (!Array.isArray(polygon) || polygon.length < 3) {
        throw new AppError('Geofence polygon wajib memiliki minimal 3 titik koordinat.', 'INVALID_POLYGON_DATA', 400);
      }
    }

    const geofence = await gpsRepo.createGeofence({
      name: String(name).trim(),
      kind,
      shape,
      centerLat: centerLat !== undefined ? Number(centerLat) : null,
      centerLng: centerLng !== undefined ? Number(centerLng) : null,
      radiusM: radiusM !== undefined ? Number(radiusM) : null,
      polygon: polygon || [],
      appliesToAll: Boolean(appliesToAll),
      motorcycleIds: Array.isArray(motorcycleIds) ? motorcycleIds.map(Number) : [],
      isActive: payload.isActive !== false,
    });

    await auditRepo.record({
      userId: actor.id,
      action: 'geofence_create',
      entity: 'geofences',
      entityId: String(geofence.id),
      details: { name, kind, shape },
      ip: reqContext.ip || null,
    });

    return geofence;
  }

  async updateGeofence(id, payload = {}, actor, reqContext = {}) {
    const existing = await gpsRepo.findGeofenceById(id);
    if (!existing) {
      throw new AppError('Area geofence tidak ditemukan.', 'GEOFENCE_NOT_FOUND', 404);
    }

    const updated = await gpsRepo.updateGeofence(id, payload);

    await auditRepo.record({
      userId: actor.id,
      action: 'geofence_update',
      entity: 'geofences',
      entityId: String(id),
      details: { changes: payload },
      ip: reqContext.ip || null,
    });

    return updated;
  }

  async deleteGeofence(id, actor, reqContext = {}) {
    const existing = await gpsRepo.findGeofenceById(id);
    if (!existing) {
      throw new AppError('Area geofence tidak ditemukan.', 'GEOFENCE_NOT_FOUND', 404);
    }

    await gpsRepo.deleteGeofence(id);

    await auditRepo.record({
      userId: actor.id,
      action: 'geofence_delete',
      entity: 'geofences',
      entityId: String(id),
      details: { name: existing.name },
      ip: reqContext.ip || null,
    });

    return { id: Number(id), deleted: true };
  }

  // PENGATURAN GPS
  async getGpsSettings() {
    const all = await settingsRepo.getSettings();
    return {
      'gps.offline_minutes': Number(all['gps.offline_minutes'] || 15),
      'gps.speed_limit_kmh': Number(all['gps.speed_limit_kmh'] || 80),
      'gps.low_battery_pct': Number(all['gps.low_battery_pct'] || 20),
      'gps.retention_days': Number(all['gps.retention_days'] || 90),
      'gps.unauthorized_move_meters': Number(all['gps.unauthorized_move_meters'] || 150),
      'gps.overdue_grace_minutes': Number(all['gps.overdue_grace_minutes'] || 30),
      'gps.history_max_days_staff': Number(all['gps.history_max_days_staff'] || 7),
      'gps.ui_throttle_seconds': Number(all['gps.ui_throttle_seconds'] || 3),
    };
  }

  async updateGpsSettings(patch = {}, actor, reqContext = {}) {
    const validated = {};

    if (patch['gps.offline_minutes'] !== undefined) {
      const v = Number(patch['gps.offline_minutes']);
      if (isNaN(v) || v < 1 || v > 120) throw new AppError('gps.offline_minutes harus antara 1 s/d 120 menit.', 'INVALID_SETTING', 400);
      validated['gps.offline_minutes'] = v;
    }

    if (patch['gps.speed_limit_kmh'] !== undefined) {
      const v = Number(patch['gps.speed_limit_kmh']);
      if (isNaN(v) || v < 30 || v > 150) throw new AppError('gps.speed_limit_kmh harus antara 30 s/d 150 km/h.', 'INVALID_SETTING', 400);
      validated['gps.speed_limit_kmh'] = v;
    }

    if (patch['gps.low_battery_pct'] !== undefined) {
      const v = Number(patch['gps.low_battery_pct']);
      if (isNaN(v) || v < 5 || v > 50) throw new AppError('gps.low_battery_pct harus antara 5 s/d 50%.', 'INVALID_SETTING', 400);
      validated['gps.low_battery_pct'] = v;
    }

    if (patch['gps.retention_days'] !== undefined) {
      const v = Number(patch['gps.retention_days']);
      if (isNaN(v) || v < 7 || v > 365) throw new AppError('gps.retention_days harus antara 7 s/d 365 hari.', 'INVALID_SETTING', 400);
      validated['gps.retention_days'] = v;
    }

    if (patch['gps.unauthorized_move_meters'] !== undefined) {
      const v = Number(patch['gps.unauthorized_move_meters']);
      if (isNaN(v) || v < 20 || v > 2000) throw new AppError('gps.unauthorized_move_meters harus antara 20 s/d 2000 meter.', 'INVALID_SETTING', 400);
      validated['gps.unauthorized_move_meters'] = v;
    }

    if (patch['gps.overdue_grace_minutes'] !== undefined) {
      const v = Number(patch['gps.overdue_grace_minutes']);
      if (isNaN(v) || v < 0 || v > 180) throw new AppError('gps.overdue_grace_minutes harus antara 0 s/d 180 menit.', 'INVALID_SETTING', 400);
      validated['gps.overdue_grace_minutes'] = v;
    }

    if (patch['gps.history_max_days_staff'] !== undefined) {
      const v = Number(patch['gps.history_max_days_staff']);
      if (isNaN(v) || v < 1 || v > 30) throw new AppError('gps.history_max_days_staff harus antara 1 s/d 30 hari.', 'INVALID_SETTING', 400);
      validated['gps.history_max_days_staff'] = v;
    }

    if (patch['gps.ui_throttle_seconds'] !== undefined) {
      const v = Number(patch['gps.ui_throttle_seconds']);
      if (isNaN(v) || v < 1 || v > 10) throw new AppError('gps.ui_throttle_seconds harus antara 1 s/d 10 detik.', 'INVALID_SETTING', 400);
      validated['gps.ui_throttle_seconds'] = v;
    }

    await settingsRepo.updateSettings(validated);

    await auditRepo.record({
      userId: actor.id,
      action: 'gps_settings_update',
      entity: 'app_settings',
      entityId: 'gps_settings',
      details: { changes: validated },
      ip: reqContext.ip || null,
    });

    return await this.getGpsSettings();
  }

  // ACCESS LOG
  async getAccessLogs(query = {}) {
    const filter = {};
    if (query.userId) filter.userId = query.userId;
    if (query.motorcycleId) filter.motorcycleId = query.motorcycleId;
    if (query.action) filter.action = query.action;

    const paging = {
      page: Math.max(1, parseInt(query.page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20)),
    };
    paging.offset = (paging.page - 1) * paging.limit;

    return await gpsRepo.listAccessLogs(filter, paging);
  }
}

module.exports = new GpsAdminService();
