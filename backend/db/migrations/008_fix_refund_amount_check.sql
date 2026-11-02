-- Migrasi 008: Memperbaiki check constraint refund_amount agar mencakup grand_total (sewa + deposit)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_bookings_refund_amount;
ALTER TABLE bookings ADD CONSTRAINT chk_bookings_refund_amount CHECK (refund_amount >= 0 AND refund_amount <= grand_total);
