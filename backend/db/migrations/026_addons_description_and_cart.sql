-- ============================================================================
-- MIGRASI 026: KOLOM DESKRIPSI PADA TABEL ADDONS & DATA AWAL LAYANAN TAMBAHAN
-- ============================================================================

ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

-- Perbarui deskripsi default untuk layanan tambahan bawaan jika masih kosong
UPDATE addons
SET
  name = 'Helm Tambahan (SNI Bersih)',
  description = 'Helm SNI bersih, higienis, dan wangi untuk penumpang / boncenger'
WHERE code = 'extra_helmet' AND (description IS NULL OR description = '');

UPDATE addons
SET
  name = 'Jas Hujan Ponco / Setelan',
  description = 'Jas hujan setelan baju & celana tebal anti bocor di segala cuaca'
WHERE code = 'raincoat' AND (description IS NULL OR description = '');

UPDATE addons
SET
  name = 'Penyangga HP (Phone Holder) Anti Getar',
  description = 'Phone holder stang kokoh dengan peredam anti getar untuk navigasi Maps'
WHERE code = 'phone_holder' AND (description IS NULL OR description = '');

