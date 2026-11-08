-- Migrasi 030: Pengetatan State Machine Transisi Status Booking
-- Menolak lompatan ilegal dari status PENDING langsung ke COMPLETED tanpa melalui alur ACTIVE / serah kunci
CREATE OR REPLACE FUNCTION enforce_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Status yang sama diabaikan
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Transisi valid:
  --   pending          -> confirmed | active (alur tunai atomik) | cancelled | expired
  --   confirmed        -> active | cancelled
  --   active           -> completed | return_requested | cancelled
  --   return_requested -> completed | active | cancelled
  --   expired          -> pending | confirmed | active | cancelled
  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'active', 'cancelled', 'expired')) OR
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

