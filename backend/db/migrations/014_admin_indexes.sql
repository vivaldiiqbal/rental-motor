-- ==============================================================================
-- Migrasi 014: Kolom Status Pesan Kontak & Index Optimalisasi Dashboard & Laporan
-- ==============================================================================

-- 1. Tambah kolom status baca pada contact_messages
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS read_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 2. Index optimalisasi laporan keuangan dan metrik dashboard
CREATE INDEX IF NOT EXISTS idx_bookings_paid_at ON bookings (paid_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_end_date ON bookings (status, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings (start_date);
CREATE INDEX IF NOT EXISTS idx_bookings_motorcycle_status ON bookings (motorcycle_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_returns_returned_at ON booking_returns (returned_at);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at_desc ON contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_role_is_active ON users (role, is_active);
CREATE INDEX IF NOT EXISTS idx_reviews_motorcycle_not_hidden ON reviews (motorcycle_id) WHERE is_hidden = false;
