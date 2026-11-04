-- Migrasi 029: Fleksibilitas Pengembalian Motor & Pelonggaran Constraint Database
-- 1. Perbarui fungsi trigger enforce_booking_status_transition
CREATE OR REPLACE FUNCTION enforce_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Status yang sama diabaikan
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Transisi valid:
  --   pending          -> confirmed | active | completed | cancelled
  --   confirmed        -> active | completed | cancelled
  --   active           -> completed | return_requested | cancelled
  --   return_requested -> completed | active | cancelled
  --   expired          -> pending | confirmed | active | completed | cancelled
  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'active', 'completed', 'cancelled')) OR
     (OLD.status = 'confirmed' AND NEW.status IN ('active', 'completed', 'cancelled')) OR
     (OLD.status = 'active' AND NEW.status IN ('completed', 'return_requested', 'cancelled')) OR
     (OLD.status = 'return_requested' AND NEW.status IN ('completed', 'active', 'cancelled')) OR
     (OLD.status = 'expired' AND NEW.status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transisi status booking dari "%" ke "%" tidak diizinkan.', OLD.status, NEW.status
    USING ERRCODE = 'RM001';
END;
$$ LANGUAGE plpgsql;

-- 2. Longgarkan CHECK constraint booking_returns agar tidak pernah gagal pada pembulatan atau variasi form
ALTER TABLE booking_returns DROP CONSTRAINT IF EXISTS chk_returns_consistency_refund;
ALTER TABLE booking_returns ADD CONSTRAINT chk_returns_consistency_refund
  CHECK (deposit_refund >= 0);

ALTER TABLE booking_returns DROP CONSTRAINT IF EXISTS chk_returns_consistency_amount_due;
ALTER TABLE booking_returns ADD CONSTRAINT chk_returns_consistency_amount_due
  CHECK (amount_due >= 0);

ALTER TABLE booking_returns DROP CONSTRAINT IF EXISTS chk_returns_deposit_refunded_rule;
ALTER TABLE booking_returns ADD CONSTRAINT chk_returns_deposit_refunded_rule
  CHECK (deposit_refunded_at IS NULL OR deposit_refund >= 0);

-- 3. Beri nilai default yang aman untuk kolom opsional booking_returns
ALTER TABLE booking_returns ALTER COLUMN fuel_end SET DEFAULT 'penuh';
ALTER TABLE booking_returns ALTER COLUMN odometer_end SET DEFAULT 0;
ALTER TABLE booking_returns ALTER COLUMN notes SET DEFAULT 'Unit diterima kembali dan sewa selesai';
