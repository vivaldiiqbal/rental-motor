const store = require('../store');

let nextDeviceId = 100;
let nextPositionId = 100;
let nextGeofenceId = 100;
let nextAlertId = 100;
let nextLogId = 100;

function getStoreData() {
  if (!store.data.gpsDevices) store.data.gpsDevices = [];
  if (!store.data.gpsPositions) store.data.gpsPositions = [];
  if (!store.data.geofences) store.data.geofences = [];
  if (!store.data.gpsAlerts) store.data.gpsAlerts = [];
  if (!store.data.gpsAccessLogs) store.data.gpsAccessLogs = [];
  return store.data;
}

const memoryGpsRepo = {
  // ==========================================
  // GPS DEVICES
  // ==========================================
  async createDevice(deviceData) {
    const data = getStoreData();
    const {
      motorcycleId,
      provider = 'simulator',
      externalId,
      label,
      isActive = true,
      batteryPct = null,
      installedAt = new Date().toISOString(),
    } = deviceData;

    // Check unique externalId
    const existingExt = data.gpsDevices.find((d) => d.externalId === externalId);
    if (existingExt) {
      const err = new Error(`Device with external_id ${externalId} already exists`);
      err.code = '23505';
      throw err;
    }

    // Check unique motorcycleId
    const existingMotor = data.gpsDevices.find((d) => d.motorcycleId === Number(motorcycleId));
    if (existingMotor) {
      const err = new Error(`Device for motorcycle ${motorcycleId} already exists`);
      err.code = '23505';
      throw err;
    }

    const device = {
      id: nextDeviceId++,
      motorcycleId: Number(motorcycleId),
      provider: String(provider),
      externalId: String(externalId),
      label: String(label),
      isActive: Boolean(isActive),
      lastSeenAt: null,
      batteryPct: batteryPct !== null ? Number(batteryPct) : null,
      installedAt: new Date(installedAt).toISOString(),
      lastLat: null,
      lastLng: null,
      lastSpeedKmh: 0,
      lastHeading: 0,
      lastIgnition: false,
      lastBatteryPct: batteryPct !== null ? Number(batteryPct) : null,
      lastPowerConnected: true,
      lastRecordedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    data.gpsDevices.push(device);
    return this.findDeviceById(device.id);
  },

  async findDeviceById(id) {
    const data = getStoreData();
    const dev = data.gpsDevices.find((d) => d.id === Number(id));
    if (!dev) return null;

    const motor = (data.motors || []).find((m) => m.id === dev.motorcycleId);
    return {
      ...dev,
      motorcycle: motor
        ? {
            id: motor.id,
            name: motor.name,
            plateNumber: motor.plateNumber || motor.plate_number,
            brand: motor.brand,
            status: motor.status,
          }
        : undefined,
    };
  },

  async findDeviceByExternalId(externalId) {
    const data = getStoreData();
    const dev = data.gpsDevices.find((d) => d.externalId === String(externalId));
    if (!dev) return null;
    return this.findDeviceById(dev.id);
  },

  async findDeviceByMotorcycleId(motorcycleId) {
    const data = getStoreData();
    const dev = data.gpsDevices.find((d) => d.motorcycleId === Number(motorcycleId));
    if (!dev) return null;
    return this.findDeviceById(dev.id);
  },

  async listDevices(filter = {}, paging = {}) {
    const data = getStoreData();
    let list = [...data.gpsDevices];

    if (filter.isActive !== undefined && filter.isActive !== null) {
      list = list.filter((d) => Boolean(d.isActive) === Boolean(filter.isActive));
    }
    if (filter.provider) {
      list = list.filter((d) => d.provider === filter.provider);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((d) => {
        const motor = (data.motors || []).find((m) => m.id === d.motorcycleId);
        return (
          d.label.toLowerCase().includes(q) ||
          d.externalId.toLowerCase().includes(q) ||
          (motor && motor.name && motor.name.toLowerCase().includes(q)) ||
          (motor && (motor.plateNumber || motor.plate_number || '').toLowerCase().includes(q))
        );
      });
    }

    const total = list.length;
    const limit = Number(paging.limit) || 100;
    const offset = Number(paging.offset) || 0;
    const paged = list.slice(offset, offset + limit);

    const items = await Promise.all(paged.map((d) => this.findDeviceById(d.id)));
    return { data: items, total };
  },

  async updateDevice(id, patch = {}) {
    const data = getStoreData();
    const dev = data.gpsDevices.find((d) => d.id === Number(id));
    if (!dev) return null;

    Object.assign(dev, patch);
    dev.updatedAt = new Date().toISOString();
    return this.findDeviceById(dev.id);
  },

  async updateDeviceLatestPosition(deviceId, posData) {
    const data = getStoreData();
    const dev = data.gpsDevices.find((d) => d.id === Number(deviceId));
    if (!dev) return null;

    const recordedTime = new Date(posData.recordedAt).getTime();
    const lastRecordedTime = dev.lastRecordedAt ? new Date(dev.lastRecordedAt).getTime() : 0;

    // Hanya perbarui jika posisi baru lebih baru atau sama
    if (!dev.lastRecordedAt || recordedTime >= lastRecordedTime) {
      dev.lastLat = Number(posData.lat);
      dev.lastLng = Number(posData.lng);
      dev.lastSpeedKmh = Number(posData.speedKmh || 0);
      dev.lastHeading = Number(posData.heading || 0);
      dev.lastIgnition = Boolean(posData.ignition);
      if (posData.batteryPct !== null && posData.batteryPct !== undefined) {
        dev.lastBatteryPct = Number(posData.batteryPct);
        dev.batteryPct = Number(posData.batteryPct);
      }
      dev.lastPowerConnected = posData.powerConnected !== false;
      dev.lastRecordedAt = new Date(posData.recordedAt).toISOString();
      dev.lastSeenAt = new Date(posData.receivedAt || Date.now()).toISOString();
      dev.updatedAt = new Date().toISOString();
      return this.findDeviceById(dev.id);
    }

    return null;
  },

  async deleteDevice(id) {
    const data = getStoreData();
    const idx = data.gpsDevices.findIndex((d) => d.id === Number(id));
    if (idx === -1) return null;
    const [removed] = data.gpsDevices.splice(idx, 1);
    return removed;
  },

  // ==========================================
  // GPS POSITIONS
  // ==========================================
  async recordPosition(positionData) {
    const data = getStoreData();
    const {
      deviceId,
      recordedAt,
      receivedAt = new Date().toISOString(),
      lat,
      lng,
      speedKmh = 0,
      heading = 0,
      accuracyM = null,
      ignition = false,
      batteryPct = null,
      powerConnected = true,
      satellites = 0,
    } = positionData;

    const recordedIso = new Date(recordedAt).toISOString();

    // Idempotency: check unique (deviceId, recordedAt)
    const duplicate = data.gpsPositions.find(
      (p) => p.deviceId === Number(deviceId) && p.recordedAt === recordedIso
    );
    if (duplicate) return null;

    const pos = {
      id: nextPositionId++,
      deviceId: Number(deviceId),
      recordedAt: recordedIso,
      receivedAt: new Date(receivedAt).toISOString(),
      lat: Number(lat),
      lng: Number(lng),
      speedKmh: Number(speedKmh || 0),
      heading: Number(heading || 0),
      accuracyM: accuracyM !== null ? Number(accuracyM) : null,
      ignition: Boolean(ignition),
      batteryPct: batteryPct !== null ? Number(batteryPct) : null,
      powerConnected: powerConnected !== false,
      satellites: Number(satellites || 0),
      createdAt: new Date().toISOString(),
    };

    data.gpsPositions.push(pos);
    return pos;
  },

  async getLatestPosition(deviceId) {
    const data = getStoreData();
    const positions = data.gpsPositions
      .filter((p) => p.deviceId === Number(deviceId))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

    return positions[0] || null;
  },

  async getPositionsHistory(deviceId, fromDate, toDate, limit = 2000) {
    const data = getStoreData();
    let positions = data.gpsPositions.filter((p) => p.deviceId === Number(deviceId));

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      positions = positions.filter((p) => new Date(p.recordedAt).getTime() >= fromTime);
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime();
      positions = positions.filter((p) => new Date(p.recordedAt).getTime() <= toTime);
    }

    positions.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    return positions.slice(0, Math.min(Number(limit) || 2000, 2000));
  },

  async getRecentPositions(deviceId, count = 5) {
    const data = getStoreData();
    const positions = data.gpsPositions
      .filter((p) => p.deviceId === Number(deviceId))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .slice(0, count);

    return positions.reverse();
  },

  async deletePositionsOlderThanBatch(cutoffDate, batchSize = 500) {
    const data = getStoreData();
    const cutoffTime = new Date(cutoffDate).getTime();
    let deleted = 0;

    data.gpsPositions = data.gpsPositions.filter((p) => {
      if (deleted < batchSize && new Date(p.recordedAt).getTime() < cutoffTime) {
        deleted++;
        return false;
      }
      return true;
    });

    return deleted;
  },

  async deleteAlertsOlderThan(cutoffDate) {
    const data = getStoreData();
    const cutoffTime = new Date(cutoffDate).getTime();
    const initialLen = data.gpsAlerts.length;
    data.gpsAlerts = data.gpsAlerts.filter((a) => new Date(a.createdAt).getTime() >= cutoffTime);
    return initialLen - data.gpsAlerts.length;
  },

  // ==========================================
  // GEOFENCES
  // ==========================================
  async createGeofence(geofenceData) {
    const data = getStoreData();
    const {
      name,
      kind = 'allowed',
      shape = 'circle',
      centerLat = null,
      centerLng = null,
      radiusM = null,
      polygon = [],
      appliesToAll = true,
      motorcycleIds = [],
      isActive = true,
    } = geofenceData;

    const geofence = {
      id: nextGeofenceId++,
      name: String(name),
      kind: String(kind),
      shape: String(shape),
      type: String(shape),
      centerLat: centerLat !== null ? Number(centerLat) : null,
      centerLng: centerLng !== null ? Number(centerLng) : null,
      radiusM: radiusM !== null ? Number(radiusM) : null,
      polygon: Array.isArray(polygon) ? polygon : [],
      geometry: shape === 'circle' ? { center: { lat: centerLat, lng: centerLng }, radius: radiusM } : { coordinates: polygon },
      appliesToAll: Boolean(appliesToAll),
      motorcycleIds: Array.isArray(motorcycleIds) ? motorcycleIds.map(Number) : [],
      isActive: Boolean(isActive),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    data.geofences.push(geofence);
    return geofence;
  },

  async findGeofenceById(id) {
    const data = getStoreData();
    return data.geofences.find((g) => g.id === Number(id)) || null;
  },

  async listGeofences(filter = {}) {
    const data = getStoreData();
    let list = [...data.geofences];

    if (filter.isActive !== undefined && filter.isActive !== null) {
      list = list.filter((g) => Boolean(g.isActive) === Boolean(filter.isActive));
    }
    if (filter.kind) {
      list = list.filter((g) => g.kind === filter.kind);
    }
    return list;
  },

  async updateGeofence(id, patch = {}) {
    const data = getStoreData();
    const g = data.geofences.find((item) => item.id === Number(id));
    if (!g) return null;

    Object.assign(g, patch);
    g.updatedAt = new Date().toISOString();
    return g;
  },

  async deleteGeofence(id) {
    const data = getStoreData();
    const idx = data.geofences.findIndex((item) => item.id === Number(id));
    if (idx === -1) return null;
    const [removed] = data.geofences.splice(idx, 1);
    return removed;
  },

  // ==========================================
  // GPS ALERTS
  // ==========================================
  async createOrIncrementAlert(alertData) {
    const data = getStoreData();
    const {
      deviceId,
      motorcycleId = null,
      bookingId = null,
      type,
      severity = 'medium',
      details = {},
      dedupeKey = null,
    } = alertData;

    if (dedupeKey) {
      const existing = data.gpsAlerts.find(
        (a) => a.deviceId === Number(deviceId) && a.dedupeKey === String(dedupeKey) && a.status !== 'resolved'
      );
      if (existing) {
        existing.occurrences = (existing.occurrences || 1) + 1;
        existing.lastSeenAt = new Date().toISOString();
        existing.details = details || {};
        return this.findAlertById(existing.id);
      }
    }

    const alert = {
      id: nextAlertId++,
      deviceId: Number(deviceId),
      motorcycleId: motorcycleId ? Number(motorcycleId) : null,
      bookingId: bookingId ? Number(bookingId) : null,
      type: String(type),
      severity: String(severity),
      status: 'open',
      details: details || {},
      dedupeKey: dedupeKey ? String(dedupeKey) : null,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      occurrences: 1,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null,
      resolvedNote: null,
      createdAt: new Date().toISOString(),
    };

    data.gpsAlerts.push(alert);
    return this.findAlertById(alert.id);
  },

  async findAlertById(id) {
    const data = getStoreData();
    const alert = data.gpsAlerts.find((a) => a.id === Number(id));
    if (!alert) return null;

    const dev = data.gpsDevices.find((d) => d.id === alert.deviceId);
    const mId = alert.motorcycleId || (dev && dev.motorcycleId);
    const motor = mId ? (data.motors || []).find((m) => m.id === mId) : null;
    const ackUser = alert.acknowledgedBy ? (data.users || []).find((u) => u.id === alert.acknowledgedBy) : null;

    return {
      ...alert,
      deviceLabel: dev ? dev.label : null,
      externalId: dev ? dev.externalId : null,
      motorcycleName: motor ? motor.name : null,
      plateNumber: motor ? (motor.plateNumber || motor.plate_number) : null,
      acknowledgedByName: ackUser ? ackUser.name : null,
    };
  },

  async findAlertByDedupeKey(dedupeKey) {
    const data = getStoreData();
    const alert = data.gpsAlerts.find((a) => a.dedupeKey === String(dedupeKey));
    if (!alert) return null;
    return this.findAlertById(alert.id);
  },

  async listAlerts(filter = {}, paging = {}) {
    const data = getStoreData();
    let list = [...data.gpsAlerts];

    if (filter.deviceId) {
      list = list.filter((a) => a.deviceId === Number(filter.deviceId));
    }
    if (filter.motorcycleId) {
      list = list.filter((a) => a.motorcycleId === Number(filter.motorcycleId));
    }
    if (filter.bookingId) {
      list = list.filter((a) => a.bookingId === Number(filter.bookingId));
    }
    if (filter.type) {
      list = list.filter((a) => a.type === filter.type);
    }
    if (filter.severity) {
      list = list.filter((a) => a.severity === filter.severity);
    }
    if (filter.status) {
      list = list.filter((a) => a.status === filter.status);
    }
    if (filter.isOpenOnly) {
      list = list.filter((a) => a.status !== 'resolved');
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const limit = Number(paging.limit) || 50;
    const offset = Number(paging.offset) || 0;
    const paged = list.slice(offset, offset + limit);

    const items = await Promise.all(paged.map((a) => this.findAlertById(a.id)));
    return { data: items, total };
  },

  async acknowledgeAlert(id, userId) {
    const data = getStoreData();
    const alert = data.gpsAlerts.find((a) => a.id === Number(id));
    if (!alert || alert.status !== 'open') return null;

    alert.status = 'acknowledged';
    alert.acknowledgedBy = Number(userId);
    alert.acknowledgedAt = new Date().toISOString();
    return this.findAlertById(alert.id);
  },

  async resolveAlert(id, resolvedNote = null) {
    const data = getStoreData();
    const alert = data.gpsAlerts.find((a) => a.id === Number(id));
    if (!alert || alert.status === 'resolved') return null;

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedNote = resolvedNote;
    return this.findAlertById(alert.id);
  },

  async resolveAlertsByDedupeKey(dedupeKey, resolvedNote = 'Auto-resolved when normal') {
    const data = getStoreData();
    const matches = data.gpsAlerts.filter((a) => a.dedupeKey === String(dedupeKey) && a.status !== 'resolved');
    matches.forEach((a) => {
      a.status = 'resolved';
      a.resolvedAt = new Date().toISOString();
      a.resolvedNote = resolvedNote;
    });
    return matches;
  },

  // ==========================================
  // GPS ACCESS LOG
  // ==========================================
  async recordAccessLog(logData) {
    const data = getStoreData();
    const log = {
      id: nextLogId++,
      userId: Number(logData.userId),
      action: String(logData.action),
      motorcycleId: logData.motorcycleId ? Number(logData.motorcycleId) : null,
      timeRange: logData.timeRange || null,
      ip: logData.ip || null,
      at: new Date().toISOString(),
    };
    data.gpsAccessLogs.push(log);
    return log;
  },

  async listAccessLogs(filter = {}, paging = {}) {
    const data = getStoreData();
    let list = [...data.gpsAccessLogs];

    if (filter.userId) {
      list = list.filter((l) => l.userId === Number(filter.userId));
    }
    if (filter.motorcycleId) {
      list = list.filter((l) => l.motorcycleId === Number(filter.motorcycleId));
    }
    if (filter.action) {
      list = list.filter((l) => l.action === filter.action);
    }

    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const total = list.length;
    const limit = Number(paging.limit) || 50;
    const offset = Number(paging.offset) || 0;
    const paged = list.slice(offset, offset + limit);

    const items = paged.map((l) => {
      const u = (data.users || []).find((user) => user.id === l.userId);
      const m = l.motorcycleId ? (data.motors || []).find((motor) => motor.id === l.motorcycleId) : null;
      return {
        ...l,
        userName: u ? u.name : null,
        userEmail: u ? u.email : null,
        motorcycleName: m ? m.name : null,
        plateNumber: m ? (m.plateNumber || m.plate_number) : null,
      };
    });

    return { data: items, total };
  },
};

module.exports = memoryGpsRepo;
