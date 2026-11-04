-- ==============================================================================
-- Migrasi 028: Hapus sistem expiry dan izinkan alur transisi cepat Admin
-- ==============================================================================

-- 1. Perbarui fungsi trigger transisi status booking agar fleksibel dan mendukung direct approve & handover
CREATE OR REPLACE FUNCTION enforce_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Status yang sama diabaikan
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Transisi valid:
  --   pending   -> confirmed | active | cancelled
  --   confirmed -> active | cancelled
  --   active    -> completed | return_requested | cancelled
  --   return_requested -> completed | active | cancelled
  --   expired   -> pending | confirmed | active | cancelled
  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'active', 'cancelled')) OR
     (OLD.status = 'confirmed' AND NEW.status IN ('active', 'cancelled')) OR
     (OLD.status = 'active' AND NEW.status IN ('completed', 'return_requested', 'cancelled')) OR
     (OLD.status = 'return_requested' AND NEW.status IN ('completed', 'active', 'cancelled')) OR
     (OLD.status = 'expired' AND NEW.status IN ('pending', 'confirmed', 'active', 'cancelled')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transisi status booking dari "%" ke "%" tidak diizinkan.', OLD.status, NEW.status
    USING ERRCODE = 'RM001';
END;
$$ LANGUAGE plpgsql;

-- 2. Konversi seluruh booking yang berstatus 'expired' kembali menjadi 'pending' (Menunggu Persetujuan Admin)
UPDATE bookings
SET status = 'pending',
    expires_at = NULL,
    updated_at = now()
WHERE status = 'expired';

-- 3. Pastikan motor yang terkait dengan booking pending/active berstatus 'rented'
UPDATE motorcycles
SET status = 'rented', updated_at = now()
WHERE id IN (
  SELECT motorcycle_id FROM bookings WHERE status IN ('pending', 'confirmed', 'active')
) AND status <> 'inactive';
