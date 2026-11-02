-- ==============================================================================
-- Migrasi 022: Fondasi Pelacakan GPS, Perangkat, Posisi, Geofences, dan Alert
-- Sesuai prinsip proteksi privasi lokasi (akses khusus admin/staff, data consent)
-- ==============================================================================

-- 1. Tabel Perangkat GPS yang terpasang pada motor
CREATE TABLE IF NOT EXISTS gps_devices (
  id SERIAL PRIMARY KEY,
  motorcycle_id INTEGER NOT NULL UNIQUE REFERENCES motorcycles(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'simulator',
  external_id VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  battery_pct NUMERIC(5, 2),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_devices_motorcycle_id ON gps_devices (motorcycle_id);
CREATE INDEX IF NOT EXISTS idx_gps_devices_external_id ON gps_devices (external_id);
CREATE INDEX IF NOT EXISTS idx_gps_devices_is_active ON gps_devices (is_active);

-- 2. Tabel Log Posisi GPS (Time-series / historical coordinates)
CREATE TABLE IF NOT EXISTS gps_positions (
  id BIGSERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES gps_devices(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  lat NUMERIC(10, 7) NOT NULL,
  lng NUMERIC(10, 7) NOT NULL,
  speed_kmh NUMERIC(6, 2) NOT NULL DEFAULT 0,
  heading NUMERIC(5, 2) NOT NULL DEFAULT 0,
  accuracy_m NUMERIC(6, 2),
  ignition BOOLEAN NOT NULL DEFAULT false,
  battery_pct NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_gps_positions_device_recorded UNIQUE (device_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_gps_positions_device_recorded ON gps_positions (device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_positions_recorded_at ON gps_positions (recorded_at);

-- 3. Tabel Geofences (Area pembatasan operasional / zona aman)
CREATE TABLE IF NOT EXISTS geofences (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('circle', 'polygon')),
  geometry JSONB NOT NULL,
  applies_to JSONB NOT NULL DEFAULT '"all"',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofences_is_active ON geofences (is_active);

-- 4. Tabel Peringatan GPS (Alerts)
CREATE TABLE IF NOT EXISTS gps_alerts (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES gps_devices(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB NOT NULL DEFAULT '{}',
  dedupe_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gps_alerts_device_created ON gps_alerts (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_alerts_dedupe ON gps_alerts (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_gps_alerts_unack ON gps_alerts (acknowledged_at) WHERE acknowledged_at IS NULL;

-- 5. Pastikan kolom gps_consent_at tersedia di tabel bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gps_consent_at TIMESTAMPTZ DEFAULT now();
