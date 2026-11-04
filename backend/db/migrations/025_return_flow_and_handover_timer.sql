-- ==============================================================================
-- Migrasi 025: Alur Pengembalian Motor (return_requested) & Timer Serah Kunci 24 Jam
-- ==============================================================================

-- 1. Tambah kolom pengajuan pengembalian motor & waktu serah terima pada tabel bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handover_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_method VARCHAR(20) DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_customer_notes TEXT DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_photo_url TEXT DEFAULT NULL;

-- Backfill handover_at dari booking_handovers untuk data lama
UPDATE bookings b
SET handover_at = bh.handed_over_at
FROM booking_handovers bh
WHERE bh.booking_id = b.id AND b.handover_at IS NULL;

-- 2. Perbarui constraint chk_bookings_status agar mendukung 'return_requested'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_bookings_status;
ALTER TABLE bookings ADD CONSTRAINT chk_bookings_status
  CHECK (status IN ('pending', 'confirmed', 'active', 'return_requested', 'completed', 'cancelled', 'expired'));

-- 3. Perbarui exclusion constraint no_double_booking agar menyertakan 'return_requested'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_double_booking;
ALTER TABLE bookings ADD CONSTRAINT no_double_booking EXCLUDE USING gist (
  motorcycle_id WITH =,
  daterange(start_date, end_date, '[)') WITH &&
) WHERE (status IN ('pending', 'confirmed', 'active', 'return_requested'));

-- 4. Perbarui fungsi trigger transisi status booking
CREATE OR REPLACE FUNCTION enforce_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Transisi valid:
  --   pending          -> confirmed | active | cancelled | expired
  --   confirmed        -> active | cancelled
  --   active           -> return_requested | completed
  --   return_requested -> completed | active
  --   expired          -> confirmed
  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'active', 'cancelled', 'expired')) OR
     (OLD.status = 'confirmed' AND NEW.status IN ('active', 'cancelled')) OR
     (OLD.status = 'active' AND NEW.status IN ('return_requested', 'completed')) OR
     (OLD.status = 'return_requested' AND NEW.status IN ('completed', 'active')) OR
     (OLD.status = 'expired' AND NEW.status = 'confirmed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transisi status booking dari "%" ke "%" tidak diizinkan.', OLD.status, NEW.status
    USING ERRCODE = 'RM001';
END;
$$ LANGUAGE plpgsql;

-- 5. Perbarui trigger validasi status saat Handover (izinkan confirmed atau pending tunai)
CREATE OR REPLACE FUNCTION trg_validate_handover_status()
RETURNS TRIGGER AS $$
DECLARE
  b_status VARCHAR(30);
BEGIN
  SELECT status INTO b_status FROM bookings WHERE id = NEW.booking_id;
  IF b_status IS NULL THEN
    RAISE EXCEPTION 'Booking #% tidak ditemukan', NEW.booking_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF b_status NOT IN ('confirmed', 'pending') THEN
    RAISE EXCEPTION 'Handover hanya diizinkan untuk booking berstatus "confirmed" atau "pending" (status saat ini: "%")', b_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Perbarui trigger validasi status saat Return (izinkan active atau return_requested)
CREATE OR REPLACE FUNCTION trg_validate_return_status_and_odometer()
RETURNS TRIGGER AS $$
DECLARE
  b_status VARCHAR(30);
  m_id INTEGER;
  odo_start INTEGER;
BEGIN
  SELECT status, motorcycle_id INTO b_status, m_id FROM bookings WHERE id = NEW.booking_id;
  IF b_status IS NULL THEN
    RAISE EXCEPTION 'Booking #% tidak ditemukan', NEW.booking_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF b_status NOT IN ('active', 'return_requested') THEN
    RAISE EXCEPTION 'Pengembalian hanya diizinkan untuk booking berstatus "active" atau "return_requested" (status saat ini: "%")', b_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT odometer_start INTO odo_start FROM booking_handovers WHERE booking_id = NEW.booking_id;
  IF odo_start IS NOT NULL AND NEW.odometer_end < odo_start THEN
    RAISE EXCEPTION 'Odometer akhir (% km) tidak boleh lebih kecil dari odometer awal (% km)', NEW.odometer_end, odo_start
      USING ERRCODE = 'check_violation';
  END IF;

  -- Update odometer armada motor secara otomatis dan kembalikan status motor ke active (available)
  IF m_id IS NOT NULL THEN
    UPDATE motorcycles
    SET odometer_km = NEW.odometer_end,
        status = CASE WHEN status = 'inactive' THEN status ELSE 'active' END,
        updated_at = now()
    WHERE id = m_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

