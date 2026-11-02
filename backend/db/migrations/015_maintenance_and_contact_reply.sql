-- ==============================================================================
-- Migrasi 015: Kolom Biaya Servis & Status Penyelesaian Perawatan serta Balasan Kontak
-- ==============================================================================

-- 1. Kolom biaya, status, dan penyelesaian pada maintenance_blocks
ALTER TABLE maintenance_blocks ADD COLUMN IF NOT EXISTS cost NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE maintenance_blocks ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'scheduled';
ALTER TABLE maintenance_blocks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE maintenance_blocks ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE maintenance_blocks ADD COLUMN IF NOT EXISTS completion_notes TEXT DEFAULT NULL;

-- Index performa pencarian maintenance status & tanggal
CREATE INDEX IF NOT EXISTS idx_maintenance_blocks_status_dates ON maintenance_blocks (status, start_date, end_date);

-- 2. Kolom balasan pesan kontak pada contact_messages
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS replied_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS reply_message TEXT DEFAULT NULL;

-- Index performa filter pesan kontak
CREATE INDEX IF NOT EXISTS idx_contact_messages_is_read ON contact_messages (is_read);
CREATE INDEX IF NOT EXISTS idx_contact_messages_replied_at ON contact_messages (replied_at);
