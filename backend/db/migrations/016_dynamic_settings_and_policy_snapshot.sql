-- ==============================================================================
-- Migrasi 016: Pengaturan Dinamis & Policy Snapshot pada Pemesanan
-- ==============================================================================

-- 1. Tambah kolom policy_snapshot pada tabel bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS policy_snapshot JSONB DEFAULT NULL;

-- 2. Backfill policy_snapshot untuk booking lama menggunakan konfigurasi standar
UPDATE bookings
SET policy_snapshot = jsonb_build_object(
  'minRentalDays', 1,
  'maxRentalDays', 30,
  'lateFeeToleranceMinutes', 120,
  'lateFeePercentPerHour', 10,
  'bookingExpireMinutes', 60,
  'defaultDeposit', COALESCE(deposit, 200000),
  'cancellationThresholdHours', 24,
  'cancellationRefundPercent', 75,
  'cancellationPolicy', jsonb_build_array(
    jsonb_build_object('thresholdHours', 48, 'refundPercent', 100),
    jsonb_build_object('thresholdHours', 24, 'refundPercent', 50),
    jsonb_build_object('thresholdHours', 0, 'refundPercent', 0)
  ),
  'operatingHours', '07.00 - 21.00 WIB',
  'minRenterAge', 17
)
WHERE policy_snapshot IS NULL;

-- 3. Inisialisasi / perbarui entri pengaturan dinamis pada app_settings
INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('address', '"Jl. Malioboro No. 123, Yogyakarta"'::jsonb, now()),
  ('contactEmail', '"support@rodakita.id"'::jsonb, now()),
  ('minRenterAge', '17'::jsonb, now()),
  ('bookingExpireMinutes', '60'::jsonb, now()),
  ('cancellationPolicy', '[{"thresholdHours": 48, "refundPercent": 100}, {"thresholdHours": 24, "refundPercent": 50}, {"thresholdHours": 0, "refundPercent": 0}]'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- Perbarui kolom general di app_settings untuk menyertakan atribut baru
UPDATE app_settings
SET value = value || jsonb_build_object(
  'address', 'Jl. Malioboro No. 123, Yogyakarta',
  'contactEmail', 'support@rodakita.id',
  'minRenterAge', 17,
  'bookingExpireMinutes', 60,
  'cancellationPolicy', jsonb_build_array(
    jsonb_build_object('thresholdHours', 48, 'refundPercent', 100),
    jsonb_build_object('thresholdHours', 24, 'refundPercent', 50),
    jsonb_build_object('thresholdHours', 0, 'refundPercent', 0)
  )
)
WHERE key = 'general';
