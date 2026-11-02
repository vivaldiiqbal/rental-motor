-- ==============================================================================
-- Migrasi 009: Izinkan transisi status expired -> confirmed untuk pembayaran terlambat
-- ==============================================================================

CREATE OR REPLACE FUNCTION enforce_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Status yang sama (tanpa perubahan) diabaikan
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Transisi valid:
  --   pending   -> confirmed | cancelled | expired
  --   confirmed -> active | cancelled
  --   active    -> completed
  --   expired   -> confirmed (khusus pembayaran terlambat ketika slot motor masih bebas)
  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled', 'expired')) OR
     (OLD.status = 'confirmed' AND NEW.status IN ('active', 'cancelled')) OR
     (OLD.status = 'active' AND NEW.status = 'completed') OR
     (OLD.status = 'expired' AND NEW.status = 'confirmed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transisi status booking dari "%" ke "%" tidak diizinkan.', OLD.status, NEW.status
    USING ERRCODE = 'RM001';
END;
$$ LANGUAGE plpgsql;
