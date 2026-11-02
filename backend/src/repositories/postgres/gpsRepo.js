const { pool } = require('../../../db/pool');
const { handlePgError } = require('./errors');

function mapDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    motorcycleId: row.motorcycle_id,
    provider: row.provider,
    externalId: row.external_id,
    label: row.label,
    isActive: Boolean(row.is_active),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    batteryPct: row.battery_pct !== null && row.battery_pct !== undefined ? Number(row.battery_pct) : null,
    installedAt: row.installed_at ? new Date(row.installed_at).toISOString() : null,
    // Kolom snapshot posisi terakhir
    lastLat: row.last_lat !== null && row.last_lat !== undefined ? Number(row.last_lat) : null,
    lastLng: row.last_lng !== null && row.last_lng !== undefined ? Number(row.last_lng) : null,
    lastSpeedKmh: Number(row.last_speed_kmh || 0),
    lastHeading: Number(row.last_heading || 0),
    lastIgnition: Boolean(row.last_ignition),
    lastBatteryPct: row.last_battery_pct !== null && row.last_battery_pct !== undefined ? Number(row.last_battery_pct) : null,
    lastPowerConnected: row.last_power_connected !== false,
    lastRecordedAt: row.last_recorded_at ? new Date(row.last_recorded_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    // Join fields if any
    motorcycle: row.motorcycle_name
      ? {
          id: row.motorcycle_id,
          name: row.motorcycle_name,
          plateNumber: row.plate_number,
          brand: row.brand,
          status: row.motorcycle_status,
        }
      : undefined,
  };
}

function mapPosition(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.device_id,
    recordedAt: row.recorded_at ? new Date(row.recorded_at).toISOString() : null,
    receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    speedKmh: Number(row.speed_kmh || 0),
    heading: Number(row.heading || 0),
    accuracyM: row.accuracy_m !== null && row.accuracy_m !== undefined ? Number(row.accuracy_m) : null,
    ignition: Boolean(row.ignition),
    batteryPct: row.battery_pct !== null && row.battery_pct !== undefined ? Number(row.battery_pct) : null,
    powerConnected: row.power_connected !== false,
    satellites: Number(row.satellites || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function mapGeofence(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind || 'allowed', // 'allowed' | 'garage' | 'forbidden'
    shape: row.shape || row.type || 'circle', // 'circle' | 'polygon'
    centerLat: row.center_lat !== null && row.center_lat !== undefined ? Number(row.center_lat) : null,
    centerLng: row.center_lng !== null && row.center_lng !== undefined ? Number(row.center_lng) : null,
    radiusM: row.radius_m !== null && row.radius_m !== undefined ? Number(row.radius_m) : null,
    polygon: typeof row.polygon === 'string' ? JSON.parse(row.polygon) : (row.polygon || []),
    geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : (row.geometry || {}),
    appliesToAll: Boolean(row.applies_to_all !== false),
    motorcycleIds: Array.isArray(row.motorcycle_ids) ? row.motorcycle_ids.map(Number) : [],
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function mapAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.device_id,
    motorcycleId: row.motorcycle_id,
    bookingId: row.booking_id,
    type: row.type,
    severity: row.severity,
    status: row.status || 'open', // 'open' | 'acknowledged' | 'resolved'
    details: typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {}),
    dedupeKey: row.dedupe_key,
    firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at).toISOString() : (row.created_at ? new Date(row.created_at).toISOString() : null),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : (row.created_at ? new Date(row.created_at).toISOString() : null),
    occurrences: Number(row.occurrences || 1),
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    resolvedNote: row.resolved_note || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    deviceLabel: row.device_label,
    externalId: row.external_id,
    motorcycleName: row.motorcycle_name,
    plateNumber: row.plate_number,
    acknowledgedByName: row.acknowledged_by_name,
  };
}

function mapAccessLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    userEmail: row.user_email || null,
    action: row.action,
    motorcycleId: row.motorcycle_id,
    motorcycleName: row.motorcycle_name || null,
    plateNumber: row.plate_number || null,
    timeRange: typeof row.time_range === 'string' ? JSON.parse(row.time_range) : row.time_range,
    ip: row.ip,
    at: row.at ? new Date(row.at).toISOString() : null,
  };
}

const gpsRepo = {
  // ==========================================
  // GPS DEVICES
  // ==========================================
  async createDevice(deviceData, client = null) {
    const db = client || pool;
    try {
      const {
        motorcycleId,
        provider = 'simulator',
        externalId,
        label,
        isActive = true,
        batteryPct = null,
        installedAt = new Date(),
      } = deviceData;

      const res = await db.query(
        `INSERT INTO gps_devices (motorcycle_id, provider, external_id, label, is_active, battery_pct, installed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
         RETURNING *`,
        [
          Number(motorcycleId),
          String(provider),
          String(externalId),
          String(label),
          Boolean(isActive),
          batteryPct !== null ? Number(batteryPct) : null,
          installedAt,
        ]
      );
      return mapDevice(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findDeviceById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT d.*, m.name AS motorcycle_name, m.plate_number, m.brand, m.status AS motorcycle_status
         FROM gps_devices d
         LEFT JOIN motorcycles m ON d.motorcycle_id = m.id
         WHERE d.id = $1`,
        [Number(id)]
      );
      return mapDevice(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findDeviceByExternalId(externalId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT d.*, m.name AS motorcycle_name, m.plate_number, m.brand, m.status AS motorcycle_status
         FROM gps_devices d
         LEFT JOIN motorcycles m ON d.motorcycle_id = m.id
         WHERE d.external_id = $1`,
        [String(externalId)]
      );
      return mapDevice(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findDeviceByMotorcycleId(motorcycleId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT d.*, m.name AS motorcycle_name, m.plate_number, m.brand, m.status AS motorcycle_status
         FROM gps_devices d
         LEFT JOIN motorcycles m ON d.motorcycle_id = m.id
         WHERE d.motorcycle_id = $1`,
        [Number(motorcycleId)]
      );
      return mapDevice(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async listDevices(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.isActive !== undefined && filter.isActive !== null) {
        params.push(Boolean(filter.isActive));
        conditions.push(`d.is_active = $${params.length}`);
      }

      if (filter.provider) {
        params.push(String(filter.provider));
        conditions.push(`d.provider = $${params.length}`);
      }

      if (filter.search) {
        params.push(`%${filter.search}%`);
        conditions.push(`(d.label ILIKE $${params.length} OR d.external_id ILIKE $${params.length} OR m.name ILIKE $${params.length} OR m.plate_number ILIKE $${params.length})`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Number(paging.limit) || 100;
      const offset = Number(paging.offset) || 0;

      const countRes = await db.query(
        `SELECT COUNT(*) AS total
         FROM gps_devices d
         LEFT JOIN motorcycles m ON d.motorcycle_id = m.id
         ${whereClause}`,
        params
      );
      const total = Number(countRes.rows[0].total);

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `SELECT d.*, m.name AS motorcycle_name, m.plate_number, m.brand, m.status AS motorcycle_status
         FROM gps_devices d
         LEFT JOIN motorcycles m ON d.motorcycle_id = m.id
         ${whereClause}
         ORDER BY d.id ASC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params
      );

      return {
        data: res.rows.map(mapDevice),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateDevice(id, patch = {}, client = null) {
    const db = client || pool;
    try {
      const allowed = ['motorcycleId', 'provider', 'externalId', 'label', 'isActive', 'lastSeenAt', 'batteryPct', 'lastRecordedAt', 'lastLat', 'lastLng'];
      const fieldMap = {
        motorcycleId: 'motorcycle_id',
        provider: 'provider',
        externalId: 'external_id',
        label: 'label',
        isActive: 'is_active',
        lastSeenAt: 'last_seen_at',
        batteryPct: 'battery_pct',
        lastRecordedAt: 'last_recorded_at',
        lastLat: 'last_lat',
        lastLng: 'last_lng',
      };

      const setClauses = [];
      const params = [Number(id)];

      for (const [key, val] of Object.entries(patch)) {
        if (allowed.includes(key) && val !== undefined) {
          params.push(val);
          setClauses.push(`${fieldMap[key]} = $${params.length}`);
        }
      }

      if (setClauses.length === 0) {
        return this.findDeviceById(id, client);
      }

      setClauses.push(`updated_at = now()`);

      const res = await db.query(
        `UPDATE gps_devices
         SET ${setClauses.join(', ')}
         WHERE id = $1
         RETURNING *`,
        params
      );
      return mapDevice(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  /**
   * Memperbarui posisi terakhir pada gps_devices HANYA BILA posisi baru lebih baru dari yang tersimpan.
   */
  async updateDeviceLatestPosition(deviceId, posData, client = null) {
    const db = client || pool;
    try {
      const {
        lat,
        lng,
        speedKmh = 0,
        heading = 0,
        ignition = false,
        batteryPct = null,
        powerConnected = true,
        recordedAt,
        receivedAt = new Date(),
      } = posData;

      const res = await db.query(
        `UPDATE gps_devices
         SET last_lat = $2,
             last_lng = $3,
             last_speed_kmh = $4,
             last_heading = $5,
             last_ignition = $6,
             last_battery_pct = COALESCE($7, battery_pct),
             last_power_connected = $8,
             last_recorded_at = $9,
             last_seen_at = $10,
             battery_pct = COALESCE($7, battery_pct),
             updated_at = now()
         WHERE id = $1
           AND (last_recorded_at IS NULL OR $9 >= last_recorded_at)
         RETURNING *`,
        [
          Number(deviceId),
          Number(lat),
          Number(lng),
          Number(speedKmh || 0),
          Number(heading || 0),
          Boolean(ignition),
          batteryPct !== null && batteryPct !== undefined ? Number(batteryPct) : null,
          Boolean(powerConnected !== false),
          new Date(recordedAt),
          new Date(receivedAt),
        ]
      );

      return res.rows[0] ? mapDevice(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async deleteDevice(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM gps_devices WHERE id = $1 RETURNING *', [Number(id)]);
      return mapDevice(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  // ==========================================
  // GPS POSITIONS
  // ==========================================
  async recordPosition(positionData, client = null) {
    const db = client || pool;
    try {
      const {
        deviceId,
        recordedAt,
        receivedAt = new Date(),
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

      const res = await db.query(
        `INSERT INTO gps_positions (
           device_id, recorded_at, received_at, lat, lng, speed_kmh, heading, accuracy_m, ignition, battery_pct, power_connected, satellites, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
         ON CONFLICT (device_id, recorded_at) DO NOTHING
         RETURNING *`,
        [
          Number(deviceId),
          new Date(recordedAt),
          new Date(receivedAt),
          Number(lat),
          Number(lng),
          Number(speedKmh || 0),
          Number(heading || 0),
          accuracyM !== null && accuracyM !== undefined ? Number(accuracyM) : null,
          Boolean(ignition),
          batteryPct !== null && batteryPct !== undefined ? Number(batteryPct) : null,
          Boolean(powerConnected !== false),
          Number(satellites || 0),
        ]
      );

      return res.rows[0] ? mapPosition(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getLatestPosition(deviceId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT * FROM gps_positions
         WHERE device_id = $1
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [Number(deviceId)]
      );
      return mapPosition(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getPositionsHistory(deviceId, fromDate, toDate, limit = 2000, client = null) {
    const db = client || pool;
    try {
      const params = [Number(deviceId)];
      const conditions = ['device_id = $1'];

      if (fromDate) {
        params.push(new Date(fromDate));
        conditions.push(`recorded_at >= $${params.length}`);
      }
      if (toDate) {
        params.push(new Date(toDate));
        conditions.push(`recorded_at <= $${params.length}`);
      }

      params.push(Math.min(Number(limit) || 2000, 2000));
      const limitParam = `$${params.length}`;

      const res = await db.query(
        `SELECT * FROM gps_positions
         WHERE ${conditions.join(' AND ')}
         ORDER BY recorded_at ASC
         LIMIT ${limitParam}`,
        params
      );

      return res.rows.map(mapPosition);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getRecentPositions(deviceId, count = 5, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT * FROM gps_positions
         WHERE device_id = $1
         ORDER BY recorded_at DESC
         LIMIT $2`,
        [Number(deviceId), Number(count)]
      );
      return res.rows.map(mapPosition).reverse(); // urutkan kronologis ASC
    } catch (err) {
      throw handlePgError(err);
    }
  },

  /**
   * Hapus posisi lama dalam batch kecil untuk mencegah penguncian tabel
   */
  async deletePositionsOlderThanBatch(cutoffDate, batchSize = 500, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `DELETE FROM gps_positions
         WHERE id IN (
           SELECT id FROM gps_positions
           WHERE recorded_at < $1
           LIMIT $2
         )`,
        [new Date(cutoffDate), Number(batchSize)]
      );
      return res.rowCount || 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async deleteAlertsOlderThan(cutoffDate, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `DELETE FROM gps_alerts
         WHERE created_at < $1`,
        [new Date(cutoffDate)]
      );
      return res.rowCount || 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  // ==========================================
  // GEOFENCES
  // ==========================================
  async createGeofence(geofenceData, client = null) {
    const db = client || pool;
    try {
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

      const geometry = shape === 'circle'
        ? { center: { lat: centerLat, lng: centerLng }, radius: radiusM }
        : { coordinates: polygon };

      const res = await db.query(
        `INSERT INTO geofences (
           name, type, kind, shape, center_lat, center_lng, radius_m, polygon, geometry, applies_to_all, is_active, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
         RETURNING *`,
        [
          String(name),
          String(shape), // type backward compatibility
          String(kind),
          String(shape),
          centerLat !== null ? Number(centerLat) : null,
          centerLng !== null ? Number(centerLng) : null,
          radiusM !== null ? Number(radiusM) : null,
          JSON.stringify(polygon || []),
          JSON.stringify(geometry),
          Boolean(appliesToAll),
          Boolean(isActive),
        ]
      );

      const created = mapGeofence(res.rows[0]);

      if (!appliesToAll && Array.isArray(motorcycleIds) && motorcycleIds.length > 0) {
        for (const mId of motorcycleIds) {
          await db.query(
            `INSERT INTO geofence_motorcycles (geofence_id, motorcycle_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [created.id, Number(mId)]
          );
        }
        created.motorcycleIds = motorcycleIds.map(Number);
      }

      return created;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findGeofenceById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT g.*, COALESCE(array_agg(gm.motorcycle_id) FILTER (WHERE gm.motorcycle_id IS NOT NULL), '{}') AS motorcycle_ids
         FROM geofences g
         LEFT JOIN geofence_motorcycles gm ON g.id = gm.geofence_id
         WHERE g.id = $1
         GROUP BY g.id`,
        [Number(id)]
      );
      return res.rows[0] ? mapGeofence(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async listGeofences(filter = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.isActive !== undefined && filter.isActive !== null) {
        params.push(Boolean(filter.isActive));
        conditions.push(`g.is_active = $${params.length}`);
      }

      if (filter.kind) {
        params.push(String(filter.kind));
        conditions.push(`g.kind = $${params.length}`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const res = await db.query(
        `SELECT g.*, COALESCE(array_agg(gm.motorcycle_id) FILTER (WHERE gm.motorcycle_id IS NOT NULL), '{}') AS motorcycle_ids
         FROM geofences g
         LEFT JOIN geofence_motorcycles gm ON g.id = gm.geofence_id
         ${whereClause}
         GROUP BY g.id
         ORDER BY g.id ASC`,
        params
      );
      return res.rows.map(mapGeofence);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async updateGeofence(id, patch = {}, client = null) {
    const db = client || pool;
    try {
      const setClauses = [];
      const params = [Number(id)];

      if (patch.name !== undefined) {
        params.push(String(patch.name));
        setClauses.push(`name = $${params.length}`);
      }
      if (patch.kind !== undefined) {
        params.push(String(patch.kind));
        setClauses.push(`kind = $${params.length}`);
      }
      if (patch.shape !== undefined) {
        params.push(String(patch.shape));
        setClauses.push(`shape = $${params.length}`);
        setClauses.push(`type = $${params.length}`);
      }
      if (patch.centerLat !== undefined) {
        params.push(patch.centerLat !== null ? Number(patch.centerLat) : null);
        setClauses.push(`center_lat = $${params.length}`);
      }
      if (patch.centerLng !== undefined) {
        params.push(patch.centerLng !== null ? Number(patch.centerLng) : null);
        setClauses.push(`center_lng = $${params.length}`);
      }
      if (patch.radiusM !== undefined) {
        params.push(patch.radiusM !== null ? Number(patch.radiusM) : null);
        setClauses.push(`radius_m = $${params.length}`);
      }
      if (patch.polygon !== undefined) {
        params.push(JSON.stringify(patch.polygon || []));
        setClauses.push(`polygon = $${params.length}`);
      }
      if (patch.appliesToAll !== undefined) {
        params.push(Boolean(patch.appliesToAll));
        setClauses.push(`applies_to_all = $${params.length}`);
      }
      if (patch.isActive !== undefined) {
        params.push(Boolean(patch.isActive));
        setClauses.push(`is_active = $${params.length}`);
      }

      if (setClauses.length > 0) {
        setClauses.push('updated_at = now()');
        await db.query(
          `UPDATE geofences SET ${setClauses.join(', ')} WHERE id = $1`,
          params
        );
      }

      if (patch.motorcycleIds !== undefined) {
        await db.query('DELETE FROM geofence_motorcycles WHERE geofence_id = $1', [Number(id)]);
        if (Array.isArray(patch.motorcycleIds) && patch.motorcycleIds.length > 0) {
          for (const mId of patch.motorcycleIds) {
            await db.query(
              'INSERT INTO geofence_motorcycles (geofence_id, motorcycle_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [Number(id), Number(mId)]
            );
          }
        }
      }

      return this.findGeofenceById(id, client);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async deleteGeofence(id, client = null) {
    const db = client || pool;
    try {
      const existing = await this.findGeofenceById(id, client);
      if (!existing) return null;
      await db.query('DELETE FROM geofences WHERE id = $1', [Number(id)]);
      return existing;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  // ==========================================
  // GPS ALERTS
  // ==========================================
  /**
   * Membuat atau menaikkan occurrences alert yang belum resolved dengan dedupe_key yang sama
   */
  async createOrIncrementAlert(alertData, client = null) {
    const db = client || pool;
    try {
      const {
        deviceId,
        motorcycleId = null,
        bookingId = null,
        type,
        severity = 'medium',
        details = {},
        dedupeKey = null,
      } = alertData;

      // Cari alert unresolved dengan dedupeKey yang sama
      if (dedupeKey) {
        const existing = await db.query(
          `SELECT id, occurrences FROM gps_alerts
           WHERE device_id = $1 AND dedupe_key = $2 AND status != 'resolved'
           LIMIT 1`,
          [Number(deviceId), String(dedupeKey)]
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          const updated = await db.query(
            `UPDATE gps_alerts
             SET occurrences = occurrences + 1,
                 last_seen_at = now(),
                 details = $2
             WHERE id = $1
             RETURNING *`,
            [row.id, JSON.stringify(details || {})]
          );
          return mapAlert(updated.rows[0]);
        }
      }

      const res = await db.query(
        `INSERT INTO gps_alerts (
           device_id, motorcycle_id, booking_id, type, severity, status, details, dedupe_key, first_seen_at, last_seen_at, occurrences, created_at
         )
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, now(), now(), 1, now())
         RETURNING *`,
        [
          Number(deviceId),
          motorcycleId ? Number(motorcycleId) : null,
          bookingId ? Number(bookingId) : null,
          String(type),
          String(severity),
          JSON.stringify(details || {}),
          dedupeKey ? String(dedupeKey) : null,
        ]
      );
      return mapAlert(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAlertById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT a.*,
                d.label AS device_label, d.external_id,
                m.name AS motorcycle_name, m.plate_number,
                u.name AS acknowledged_by_name
         FROM gps_alerts a
         JOIN gps_devices d ON a.device_id = d.id
         LEFT JOIN motorcycles m ON COALESCE(a.motorcycle_id, d.motorcycle_id) = m.id
         LEFT JOIN users u ON a.acknowledged_by = u.id
         WHERE a.id = $1`,
        [Number(id)]
      );
      return res.rows[0] ? mapAlert(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAlertByDedupeKey(dedupeKey, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT a.*, d.label AS device_label, d.external_id, d.motorcycle_id
         FROM gps_alerts a
         JOIN gps_devices d ON a.device_id = d.id
         WHERE a.dedupe_key = $1
         ORDER BY a.created_at DESC
         LIMIT 1`,
        [String(dedupeKey)]
      );
      return mapAlert(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async listAlerts(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.deviceId) {
        params.push(Number(filter.deviceId));
        conditions.push(`a.device_id = $${params.length}`);
      }

      if (filter.motorcycleId) {
        params.push(Number(filter.motorcycleId));
        conditions.push(`COALESCE(a.motorcycle_id, d.motorcycle_id) = $${params.length}`);
      }

      if (filter.bookingId) {
        params.push(Number(filter.bookingId));
        conditions.push(`a.booking_id = $${params.length}`);
      }

      if (filter.type) {
        params.push(String(filter.type));
        conditions.push(`a.type = $${params.length}`);
      }

      if (filter.severity) {
        params.push(String(filter.severity));
        conditions.push(`a.severity = $${params.length}`);
      }

      if (filter.status) {
        params.push(String(filter.status));
        conditions.push(`a.status = $${params.length}`);
      }

      if (filter.isOpenOnly) {
        conditions.push("a.status != 'resolved'");
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Number(paging.limit) || 50;
      const offset = Number(paging.offset) || 0;

      const countRes = await db.query(
        `SELECT COUNT(*) AS total
         FROM gps_alerts a
         JOIN gps_devices d ON a.device_id = d.id
         ${whereClause}`,
        params
      );
      const total = Number(countRes.rows[0].total);

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `SELECT a.*,
                d.label AS device_label, d.external_id, d.motorcycle_id AS dev_motorcycle_id,
                m.name AS motorcycle_name, m.plate_number,
                u.name AS acknowledged_by_name
         FROM gps_alerts a
         JOIN gps_devices d ON a.device_id = d.id
         LEFT JOIN motorcycles m ON COALESCE(a.motorcycle_id, d.motorcycle_id) = m.id
         LEFT JOIN users u ON a.acknowledged_by = u.id
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params
      );

      return {
        data: res.rows.map(mapAlert),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async acknowledgeAlert(id, userId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `UPDATE gps_alerts
         SET acknowledged_by = $1, acknowledged_at = now(), status = 'acknowledged'
         WHERE id = $2 AND status = 'open'
         RETURNING *`,
        [Number(userId), Number(id)]
      );
      return res.rows[0] ? this.findAlertById(id, client) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async resolveAlert(id, resolvedNote = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `UPDATE gps_alerts
         SET status = 'resolved', resolved_at = now(), resolved_note = $2
         WHERE id = $1 AND status != 'resolved'
         RETURNING *`,
        [Number(id), resolvedNote || null]
      );
      return res.rows[0] ? this.findAlertById(id, client) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async resolveAlertsByDedupeKey(dedupeKey, resolvedNote = 'Auto-resolved when normal', client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `UPDATE gps_alerts
         SET status = 'resolved', resolved_at = now(), resolved_note = $2
         WHERE dedupe_key = $1 AND status != 'resolved'
         RETURNING *`,
        [String(dedupeKey), resolvedNote]
      );
      return res.rows.map(mapAlert);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  // ==========================================
  // GPS ACCESS LOG
  // ==========================================
  async recordAccessLog(logData, client = null) {
    const db = client || pool;
    try {
      const { userId, action, motorcycleId = null, timeRange = null, ip = null } = logData;
      const res = await db.query(
        `INSERT INTO gps_access_log (user_id, action, motorcycle_id, time_range, ip, at)
         VALUES ($1, $2, $3, $4, $5, now())
         RETURNING *`,
        [
          Number(userId),
          String(action),
          motorcycleId ? Number(motorcycleId) : null,
          timeRange ? JSON.stringify(timeRange) : null,
          ip ? String(ip) : null,
        ]
      );
      return mapAccessLog(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async listAccessLogs(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.userId) {
        params.push(Number(filter.userId));
        conditions.push(`l.user_id = $${params.length}`);
      }

      if (filter.motorcycleId) {
        params.push(Number(filter.motorcycleId));
        conditions.push(`l.motorcycle_id = $${params.length}`);
      }

      if (filter.action) {
        params.push(String(filter.action));
        conditions.push(`l.action = $${params.length}`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Number(paging.limit) || 50;
      const offset = Number(paging.offset) || 0;

      const countRes = await db.query(
        `SELECT COUNT(*) AS total FROM gps_access_log l ${whereClause}`,
        params
      );
      const total = Number(countRes.rows[0].total);

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `SELECT l.*, u.name AS user_name, u.email AS user_email, m.name AS motorcycle_name, m.plate_number
         FROM gps_access_log l
         LEFT JOIN users u ON l.user_id = u.id
         LEFT JOIN motorcycles m ON l.motorcycle_id = m.id
         ${whereClause}
         ORDER BY l.at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params
      );

      return {
        data: res.rows.map(mapAccessLog),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = gpsRepo;
