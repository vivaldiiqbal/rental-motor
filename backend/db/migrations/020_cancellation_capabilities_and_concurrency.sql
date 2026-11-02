-- ==============================================================================
-- Migrasi 020: Mesin Pembatalan Baru, Concurrency Version, dan Kolom Pembayaran
-- ==============================================================================

-- 1. Tambah kolom version, payment_method, dan cancelled_by pada bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'bank_transfer';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(30) DEFAULT NULL;

-- 2. Tambah kolom bukti pembayaran pada payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_path VARCHAR(255) DEFAULT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_verified_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_rejection_reason TEXT DEFAULT NULL;

-- 3. Perbarui check constraint pada payments.method agar mendukung 'cash'
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_method;
ALTER TABLE payments ADD CONSTRAINT chk_payments_method CHECK (method IN ('bank_transfer', 'ewallet', 'qris', 'cash'));

-- 4. Perbarui check constraint pada payments.status agar mendukung 'cancelled'
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_status;
ALTER TABLE payments ADD CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded', 'needs_refund', 'cancelled'));

-- 5. Backfill payment_method pada bookings yang sudah ada dari tabel payments
UPDATE bookings b
SET payment_method = p.method
FROM payments p
WHERE p.booking_id = b.id AND p.method IS NOT NULL;

-- 6. Tambah pengaturan batas pembatalan dan booking tunai pada app_settings
INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('maxUnclaimedCashBookings', '1'::jsonb, now()),
  ('maxCancellationsPer30Days', '3'::jsonb, now()),
  ('cashExpireGraceHours', '3'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- Perbarui general app_settings dengan nilai default
UPDATE app_settings
SET value = value || jsonb_build_object(
  'maxUnclaimedCashBookings', 1,
  'maxCancellationsPer30Days', 3,
  'cashExpireGraceHours', 3
)
WHERE key = 'general';
