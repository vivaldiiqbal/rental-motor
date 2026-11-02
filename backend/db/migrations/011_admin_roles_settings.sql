-- ==============================================================================
-- Migrasi 011: Admin Roles, Payment Cash Method, dan App Settings
-- ==============================================================================

-- 1. Perluas CHECK users.role menjadi (customer, admin, staff)
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('customer', 'admin', 'staff'));

-- 2. Perluas CHECK payments.method dengan 'cash'
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_method;
ALTER TABLE payments ADD CONSTRAINT chk_payments_method CHECK (method IN ('bank_transfer', 'ewallet', 'qris', 'cash'));

-- 3. Perluas CHECK booking_timeline.actor dengan 'staff'
ALTER TABLE booking_timeline DROP CONSTRAINT IF EXISTS chk_booking_timeline_actor;
ALTER TABLE booking_timeline ADD CONSTRAINT chk_booking_timeline_actor CHECK (actor IN ('customer', 'system', 'admin', 'payment', 'staff'));

-- 4. Tabel app_settings untuk konfigurasi global operasional rental
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Seed nilai bawaan (sesuai config/rules.js)
INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('brandName', '"RodaKita Rental Motor"'::jsonb, now()),
  ('whatsappNumber', '"081234567890"'::jsonb, now()),
  ('operatingHours', '"07.00 - 21.00 WIB"'::jsonb, now()),
  ('minRentalDays', '1'::jsonb, now()),
  ('maxRentalDays', '30'::jsonb, now()),
  ('paymentExpiryMinutes', '60'::jsonb, now()),
  ('lateFeeToleranceMinutes', '120'::jsonb, now()),
  ('lateFeePercentPerHour', '10'::jsonb, now()),
  ('defaultDeposit', '200000'::jsonb, now()),
  ('cancellationThresholdHours', '24'::jsonb, now()),
  ('cancellationRefundPercent', '75'::jsonb, now()),
  ('general', '{"brandName": "RodaKita Rental Motor", "whatsappNumber": "081234567890", "operatingHours": "07.00 - 21.00 WIB", "minRentalDays": 1, "maxRentalDays": 30, "paymentExpiryMinutes": 60, "lateFeeToleranceMinutes": 120, "lateFeePercentPerHour": 10, "defaultDeposit": 200000, "cancellationThresholdHours": 24, "cancellationRefundPercent": 75}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
