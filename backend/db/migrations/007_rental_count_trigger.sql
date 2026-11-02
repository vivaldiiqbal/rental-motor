-- ==============================================================================
-- Migrasi 007: Trigger Tambahan Increment rental_count Motor saat Booking Completed
-- ==============================================================================

CREATE OR REPLACE FUNCTION increment_motor_rental_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    UPDATE motorcycles
    SET rental_count = rental_count + 1, updated_at = now()
    WHERE id = NEW.motorcycle_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_rental_count ON bookings;
CREATE TRIGGER trg_bookings_rental_count
AFTER UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION increment_motor_rental_count();
