-- ==============================================================================
-- Migrasi 023: Ekspansi Pelacakan GPS, Geofence Motorcycles, Status Alert & Akses Log
-- Sesuai spesifikasi PRD v2.0 Tahap 1 & 2 Fondasi Pelacakan GPS
-- ==============================================================================

-- 1. Kolom Posisi Terakhir pada gps_devices (diperbarui hanya jika posisi baru lebih baru)
ALTER TABLE gps_devices
  ADD COLUMN IF NOT EXISTS last_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS last_lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS last_speed_kmh NUMERIC(6, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_heading NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ignition BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_battery_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS last_power_connected BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_recorded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gps_devices_last_recorded_at ON gps_devices (last_recorded_at);

-- 2. Kolom received_at, power_connected, dan satellites pada gps_positions
ALTER TABLE gps_positions
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS power_connected BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS satellites INTEGER DEFAULT 0;

-- 3. Ekspansi Tabel Geofences (kind, shape, center, radius, polygon, applies_to_all)
ALTER TABLE geofences
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'allowed',
  ADD COLUMN IF NOT EXISTS shape VARCHAR(20) NOT NULL DEFAULT 'circle',
  ADD COLUMN IF NOT EXISTS center_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS center_lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS radius_m NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS polygon JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS applies_to_all BOOLEAN NOT NULL DEFAULT true;

-- Tabel penghubung aturan geofence untuk motor tertentu
CREATE TABLE IF NOT EXISTS geofence_motorcycles (
  geofence_id INTEGER NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  motorcycle_id INTEGER NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
  PRIMARY KEY (geofence_id, motorcycle_id)
);

CREATE INDEX IF NOT EXISTS idx_geofence_motorcycles_motorcycle ON geofence_motorcycles (motorcycle_id);

-- 4. Ekspansi Tabel gps_alerts (status, occurrences, resolving, dedupe)
ALTER TABLE gps_alerts
  ADD COLUMN IF NOT EXISTS motorcycle_id INTEGER REFERENCES motorcycles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS occurrences INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_note TEXT;

CREATE INDEX IF NOT EXISTS idx_gps_alerts_motorcycle_id ON gps_alerts (motorcycle_id);
CREATE INDEX IF NOT EXISTS idx_gps_alerts_status ON gps_alerts (status);

-- Indeks unik parsial agar alert dengan dedupe_key yang sama tidak duplikat selama belum resolved
CREATE UNIQUE INDEX IF NOT EXISTS uq_gps_alerts_unresolved_dedupe
  ON gps_alerts (device_id, dedupe_key)
  WHERE status != 'resolved' AND dedupe_key IS NOT NULL;

-- 5. Tabel Audit Log Akses Posisi GPS (Privasi Lokasi)
CREATE TABLE IF NOT EXISTS gps_access_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  motorcycle_id INTEGER REFERENCES motorcycles(id) ON DELETE SET NULL,
  time_range JSONB,
  ip VARCHAR(100),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_access_log_user_at ON gps_access_log (user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_access_log_motorcycle ON gps_access_log (motorcycle_id);

-- 6. Pengaturan GPS Default pada app_settings
INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('gps.offline_minutes', '15', now()),
  ('gps.speed_limit_kmh', '80', now()),
  ('gps.low_battery_pct', '20', now()),
  ('gps.retention_days', '90', now()),
  ('gps.unauthorized_move_meters', '150', now()),
  ('gps.overdue_grace_minutes', '30', now()),
  ('gps.history_max_days_staff', '7', now()),
  ('gps.ui_throttle_seconds', '3', now())
ON CONFLICT (key) DO NOTHING;
