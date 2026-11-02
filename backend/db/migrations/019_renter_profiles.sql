-- 019_renter_profiles.sql
-- Sumber Data Tunggal Profil Penyewa & Renter Snapshot

-- 1. Perluas tipe dokumen pengguna di user_documents untuk mendukung 'selfie'
ALTER TABLE user_documents DROP CONSTRAINT IF EXISTS chk_user_documents_type;
ALTER TABLE user_documents ADD CONSTRAINT chk_user_documents_type CHECK (type IN ('ktp', 'sim', 'selfie'));

-- 2. Tabel renter_profiles (user_id PK)
CREATE TABLE IF NOT EXISTS renter_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name_ktp VARCHAR(150) NOT NULL,
  birth_date DATE NOT NULL,
  nik_hash VARCHAR(64) NOT NULL UNIQUE,
  nik_last4 VARCHAR(4) NOT NULL,
  address_ktp TEXT NOT NULL,
  phone_e164 VARCHAR(20) NOT NULL,
  stay_address TEXT NOT NULL,
  emergency_name VARCHAR(100) NOT NULL,
  emergency_relation VARCHAR(50) NOT NULL,
  emergency_phone VARCHAR(20) NOT NULL,
  terms_version_accepted INTEGER NOT NULL DEFAULT 1,
  privacy_version_accepted INTEGER NOT NULL DEFAULT 1,
  gps_consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_emergency_relation CHECK (emergency_relation IN ('orang tua', 'pasangan', 'saudara', 'kerabat', 'teman'))
);

CREATE INDEX IF NOT EXISTS idx_renter_profiles_nik_hash ON renter_profiles(nik_hash);
CREATE INDEX IF NOT EXISTS idx_renter_profiles_phone ON renter_profiles(phone_e164);

-- 3. Tambahkan kolom renter_snapshot JSONB pada bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS renter_snapshot JSONB DEFAULT NULL;
