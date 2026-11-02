-- ==============================================================================
-- Migrasi 005: Trigger Otomatis (Updated_at, Enforce Status Transition, & Statistik Rating)
-- ==============================================================================

-- 1. Fungsi Umum Update Timestamp updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pasang trigger set_updated_at() untuk semua tabel ber-updated_at
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_motorcycles_updated_at ON motorcycles;
CREATE TRIGGER trg_motorcycles_updated_at
BEFORE UPDATE ON motorcycles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_promo_codes_updated_at ON promo_codes;
CREATE TRIGGER trg_promo_codes_updated_at
BEFORE UPDATE ON promo_codes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Fungsi Enforce Transisi Status Booking
-- Hanya izinkan:
--   pending   -> confirmed | cancelled | expired
--   confirmed -> active | cancelled
--   active    -> completed
-- Status yang sama (tanpa perubahan) diabaikan.
-- Selain itu RAISE EXCEPTION dengan ERRCODE 'RM001'.
CREATE OR REPLACE FUNCTION enforce_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Status yang sama (tanpa perubahan) diabaikan
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Transisi valid
  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled', 'expired')) OR
     (OLD.status = 'confirmed' AND NEW.status IN ('active', 'cancelled')) OR
     (OLD.status = 'active' AND NEW.status = 'completed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transisi status booking dari "%" ke "%" tidak diizinkan.', OLD.status, NEW.status
    USING ERRCODE = 'RM001';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_status_transition ON bookings;
CREATE TRIGGER trg_bookings_status_transition
BEFORE UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION enforce_booking_status_transition();

-- 3. Fungsi Sinkronisasi Otomatis Rating Rata-rata, Jumlah Ulasan, dan Distribusi Rating 1..5
CREATE OR REPLACE FUNCTION sync_motor_review_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_motor_id INTEGER;
  new_avg NUMERIC(3, 2);
  new_count INTEGER;
  r1 INTEGER;
  r2 INTEGER;
  r3 INTEGER;
  r4 INTEGER;
  r5 INTEGER;
BEGIN
  target_motor_id := COALESCE(NEW.motorcycle_id, OLD.motorcycle_id);

  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0.00),
    COUNT(*),
    COUNT(*) FILTER (WHERE rating = 1),
    COUNT(*) FILTER (WHERE rating = 2),
    COUNT(*) FILTER (WHERE rating = 3),
    COUNT(*) FILTER (WHERE rating = 4),
    COUNT(*) FILTER (WHERE rating = 5)
  INTO new_avg, new_count, r1, r2, r3, r4, r5
  FROM reviews
  WHERE motorcycle_id = target_motor_id;

  UPDATE motorcycles
  SET
    rating_avg = new_avg,
    rating_count = new_count,
    rating_1 = r1,
    rating_2 = r2,
    rating_3 = r3,
    rating_4 = r4,
    rating_5 = r5,
    updated_at = now()
  WHERE id = target_motor_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reviews_sync_stats ON reviews;
CREATE TRIGGER trg_reviews_sync_stats
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION sync_motor_review_stats();
