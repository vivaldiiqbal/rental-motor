-- ==============================================================================
-- Migrasi 006: Views & Database Helpers
-- ==============================================================================

-- 1. View Ringkasan Katalog Motor (Menggabungkan Gambar dan Fitur)
CREATE OR REPLACE VIEW v_motorcycles AS
SELECT
  m.*,
  COALESCE(
    (SELECT json_agg(mi.url ORDER BY mi.position ASC, mi.id ASC)
     FROM motorcycle_images mi WHERE mi.motorcycle_id = m.id),
    '[]'::json
  ) AS images,
  COALESCE(
    (SELECT json_agg(mf.feature ORDER BY mf.feature ASC)
     FROM motorcycle_features mf WHERE mf.motorcycle_id = m.id),
    '[]'::json
  ) AS features,
  (SELECT mi.url FROM motorcycle_images mi WHERE mi.motorcycle_id = m.id AND mi.is_primary = true LIMIT 1) AS primary_image
FROM motorcycles m;

-- 2. View Pemesanan Aktif Beserta Rincian Pengguna dan Motor
CREATE OR REPLACE VIEW v_active_bookings AS
SELECT
  b.id,
  b.booking_code,
  b.status,
  b.start_date,
  b.end_date,
  b.pickup_time,
  b.total_days,
  b.rental_total,
  b.grand_total,
  b.paid_at,
  u.id AS user_id,
  u.name AS user_name,
  u.email AS user_email,
  u.phone AS user_phone,
  m.id AS motorcycle_id,
  m.name AS motorcycle_name,
  m.plate_number AS motorcycle_plate
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN motorcycles m ON b.motorcycle_id = m.id
WHERE b.status IN ('pending', 'confirmed', 'active');
