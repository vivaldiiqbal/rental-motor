-- ==============================================================================
-- Migrasi 004: Indeks Performa & Pencarian Trigram
-- ==============================================================================

-- 1. users & user_documents
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents (user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_status ON user_documents (status);

-- 2. motorcycles
CREATE INDEX IF NOT EXISTS idx_motorcycles_status_type ON motorcycles (status, type);
CREATE INDEX IF NOT EXISTS idx_motorcycles_brand ON motorcycles (brand);
CREATE INDEX IF NOT EXISTS idx_motorcycles_price_per_day ON motorcycles (price_per_day);
CREATE INDEX IF NOT EXISTS idx_motorcycles_rating_avg ON motorcycles (rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_motorcycles_search_trgm ON motorcycles USING gin (lower(name || ' ' || brand) gin_trgm_ops);

-- 3. motorcycle_images & maintenance_blocks
CREATE INDEX IF NOT EXISTS idx_motorcycle_images_motor_pos ON motorcycle_images (motorcycle_id, position);
CREATE INDEX IF NOT EXISTS idx_maintenance_blocks_motorcycle_id ON maintenance_blocks (motorcycle_id);

-- 4. bookings
CREATE INDEX IF NOT EXISTS idx_bookings_user_created ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_pending_expires ON bookings (status, expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bookings_motor_dates ON bookings (motorcycle_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings (booking_code);

-- 5. booking_items & booking_timeline
CREATE INDEX IF NOT EXISTS idx_booking_items_booking_id ON booking_items (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_timeline_booking_id_at ON booking_timeline (booking_id, at);

-- 6. payments, reviews, favorites, contact_messages
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_reviews_motor_created ON reviews (motorcycle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages (created_at DESC);
