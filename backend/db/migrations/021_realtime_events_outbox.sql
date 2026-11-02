-- ==============================================================================
-- Migrasi 021: Tabel Realtime Events Outbox & PostgreSQL LISTEN/NOTIFY
-- ==============================================================================

-- 1. Buat tabel events untuk pola Outbox
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(100) DEFAULT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indeks untuk query Last-Event-ID, rentang waktu retensi 24 jam, dan user_id
CREATE INDEX IF NOT EXISTS idx_events_id ON events (id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events (user_id);

-- 2. Fungsi trigger pengirim NOTIFY PostgreSQL
CREATE OR REPLACE FUNCTION notify_realtime_event()
RETURNS TRIGGER AS $$
DECLARE
  notification_payload json;
BEGIN
  notification_payload := json_build_object(
    'id', NEW.id,
    'type', NEW.type,
    'entityId', NEW.entity_id,
    'userId', NEW.user_id,
    'version', NEW.version,
    'payload', NEW.payload,
    'createdAt', NEW.created_at
  );

  -- NOTIFY hanya terkirim ke klien LISTEN saat transaksi berhasil COMMIT
  PERFORM pg_notify('rodakita_events', notification_payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger otomatis setelah INSERT pada events
DROP TRIGGER IF EXISTS trg_notify_realtime_event ON events;
CREATE TRIGGER trg_notify_realtime_event
AFTER INSERT ON events
FOR EACH ROW
EXECUTE FUNCTION notify_realtime_event();
