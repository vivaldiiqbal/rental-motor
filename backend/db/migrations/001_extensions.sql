-- ==============================================================================
-- Migrasi 001: Ekstensi PostgreSQL
-- btree_gist : Mendukung exclusion constraints daterange + integer (mencegah double booking)
-- pg_trgm    : Mendukung pencarian teks trigram (fuzzy search nama, merek, tipe motor)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
