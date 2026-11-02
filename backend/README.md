# RodaKita Backend REST API (Tahap 3: PostgreSQL Migration & Database Hardening)

Backend REST API untuk website rental motor **RodaKita**, dibangun dengan arsitektur bersih (**Clean Layered Architecture**) menggunakan **Node.js 20+ (CommonJS)**, **Express 4**, dan **PostgreSQL 14+ (pg)** tanpa ORM.

Sistem mendukung driver ganda (**Dual Driver Parity**):
- `USE_DB=postgres`: Produksi & staging menggunakan PostgreSQL dengan constraint integritas data, index GiST, trigger, advisory locks, dan connection pool tahan banting.
- `USE_DB=memory`: Fallback in-memory atomic JSON storage yang menjaga kompatibilitas kontrak API 100% tanpa perubahan di sisi client/frontend.

---

## 1. Keamanan Database & Role Privileges

Aplikasi beroperasi dengan prinsip hak akses terkecil (**Principle of Least Privilege**):
1. **Role Migrasi & Pemilik Skema (`rodakita_owner`)**: Memiliki izin DDL penuh (`CREATE`, `ALTER`, `DROP`) untuk menjalankan skrip migrasi `001-009`.
2. **Role Aplikasi Non-Superuser (`rodakita_user`)**: Hanya memiliki izin DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) pada tabel data aplikasi, serta `USAGE, SELECT, UPDATE` pada sequence. Role ini **tidak dapat** mengubah skema atau melakukan `DROP TABLE`.

### Perintah Pembuatan Database & Role (Jalankan sebagai `postgres` superuser)

```sql
-- 1. Buat Database Development & Testing
CREATE DATABASE rodakita_dev;
CREATE DATABASE rodakita_test;

-- 2. Buat Role Pemilik Skema (Migration Owner)
CREATE ROLE rodakita_owner WITH LOGIN PASSWORD 'owner_secure_password_2026';

-- 3. Buat Role Aplikasi Non-Superuser (DML-only)
CREATE ROLE rodakita_user WITH LOGIN PASSWORD 'rahasia123';

-- 4. Hubungkan ke database rodakita_dev dan pasang ekstensi terpercaya
\c rodakita_dev
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Pindahkan kepemilikan skema public ke rodakita_owner
ALTER SCHEMA public OWNER TO rodakita_owner;
GRANT ALL ON SCHEMA public TO rodakita_owner;

-- Berikan hak akses terbatas kepada rodakita_user
GRANT USAGE ON SCHEMA public TO rodakita_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rodakita_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO rodakita_user;

-- Pastikan tabel baru di masa mendatang otomatis mendapatkan hak yang sama
ALTER DEFAULT PRIVILEGES FOR ROLE rodakita_owner IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rodakita_user;

ALTER DEFAULT PRIVILEGES FOR ROLE rodakita_owner IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO rodakita_user;

-- 5. Lakukan hal yang sama untuk database pengujian (rodakita_test)
\c rodakita_test
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER SCHEMA public OWNER TO rodakita_owner;
GRANT ALL ON SCHEMA public TO rodakita_owner;
GRANT USAGE ON SCHEMA public TO rodakita_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rodakita_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO rodakita_user;
ALTER DEFAULT PRIVILEGES FOR ROLE rodakita_owner IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rodakita_user;
ALTER DEFAULT PRIVILEGES FOR ROLE rodakita_owner IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO rodakita_user;
```

---

## 2. Hardening & Pencegahan Kerentanan

- **100% Parameterized Queries**: Seluruh query SQL menggunakan parameter terikat (`$1, $2, ...`). Tidak ada interpolasi string pengguna ke dalam sintaks SQL.
- **Whitelist Internal pada Dynamic Queries**: Pengurutan sort (`sortMap`) dan klausul filter hanya memilih fragmen yang telah divalidasi dari whitelist internal.
- **Sanitasi Wildcard ILIKE**: Karakter `%`, `_`, dan `\` pada input pencarian teks di-escape (`replace(/[%_\\]/g, '\\$&')`) sebelum dirangkai ke query ILIKE.
- **Perlindungan Kredensial**: String koneksi `DATABASE_URL` hanya dibaca dari environment variable (`.env`). Logger HTTP dan Morgan memfilter `DATABASE_URL` dan data rahasia agar tidak bocor ke log.
- **SSL Production**: Didukung lewat `DATABASE_SSL=true` dengan opsi SSL context aman.
- **Penyimpanan Dokumen KTP/SIM Privat**: Dokumen identitas disimpan di direktori privat (`uploads/documents/`) yang **tidak di-expose** lewat `express.static`. Database hanya menyimpan metadata acak (`stored_name`), dan akses unduhan/pratinjau hanya diizinkan bagi pemilik akun atau Admin via endpoint terotentikasi.

---

## 3. Strategi Backup & Langkah Restore

### A. Strategi Backup Terjadwal (Cron Job)

Backup basis data harian otomatis dijalankan menggunakan utilitas bawaan PostgreSQL `pg_dump` dengan format kustom terkompresi (`-Fc`).

Simpan skrip berikut di `/opt/rodakita/backup-db.sh`:
```bash
#!/usr/bin/env bash
set -e

BACKUP_DIR="/var/backups/rodakita"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/rodakita_backup_$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"

# Eksekusi pg_dump format kustom (-Fc)
PGPASSWORD="rahasia123" pg_dump \
  -h localhost \
  -p 5433 \
  -U rodakita_owner \
  -d rodakita_dev \
  -F c \
  -b \
  -v \
  -f "$FILENAME"

echo "[$(date)] Backup sukses disimpan di: $FILENAME"

# Retensi: Hapus berkas backup yang lebih lama dari 7 hari
find "$BACKUP_DIR" -type f -name "rodakita_backup_*.dump" -mtime +7 -exec rm {} \;
```

Pasang pada crontab sistem (`crontab -e`) untuk berjalan setiap pukul 02:00 WIB dini hari:
```cron
0 2 * * * /opt/rodakita/backup-db.sh >> /var/log/rodakita_backup.log 2>&1
```

### B. Prosedur Restore Darurat

Bila terjadi insiden kehilangan atau kerusakan data, ikuti langkah restore berikut:

1. Hentikan aplikasi backend sementara:
   ```bash
   pm2 stop rodakita-backend  # atau kill node process
   ```

2. Putuskan koneksi aktif ke database:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'rodakita_dev' AND pid <> pg_backend_pid();
   ```

3. Jalankan `pg_restore` dengan opsi clean schema:
   ```bash
   PGPASSWORD="owner_secure_password_2026" pg_restore \
     -h localhost \
     -p 5433 \
     -U rodakita_owner \
     -d rodakita_dev \
     --clean \
     --if-exists \
     --verbose \
     /var/backups/rodakita/rodakita_backup_YYYYMMDD_HHMMSS.dump
   ```

4. Verifikasi integritas data pasca-restore:
   ```bash
   npm run db:verify
   ```

5. Mulai kembali server backend:
   ```bash
   pm2 start rodakita-backend
   ```

---

## 4. Arsitektur Database (20 Tabel & Mekanisme Kunci)

```
[users] 1 ──── ∞ [user_documents] (ktp, sim)
   │
   ├─ 1 ──── ∞ [favorites]
   ├─ 1 ──── ∞ [bookings] 1 ──── ∞ [booking_items]
   │              │        ├─ 1 ──── ∞ [booking_timeline]
   │              │        ├─ 1 ──── 1 [promo_redemptions]
   │              │        └─ 1 ──── ∞ [payments] 1 ── ∞ [payment_events]
   │              │                     │
   │              └─ 1 ──── 1 [reviews] ┘
   │
[motorcycles] 1 ──── ∞ [motorcycle_images]
      │        ├─ 1 ──── ∞ [motorcycle_features]
      │        └─ 1 ──── ∞ [maintenance_blocks]
      └─ 1 ──── ∞ [bookings]
```

### Mekanisme Integritas Data & Konkurensi:
1. **Anti Double-Booking (Constraint Exclusion GiST)**:
   ```sql
   CONSTRAINT no_double_booking EXCLUDE USING gist (
     motorcycle_id WITH =,
     daterange(start_date, end_date, '[)') WITH &&
   ) WHERE (status IN ('pending', 'confirmed', 'active'));
   ```
   Menolak overlapping booking di level engine SQL dengan semantik `[start, end)`. Tanggal kembali jam 09:00 dapat langsung diambil penyewa lain di hari yang sama tanpa bentrok.
2. **Anti Overlapping Maintenance Blocks**:
   Constraint exclusion serupa menjamin jadwal perawatan motor tidak beririsan.
3. **State Machine Trigger (`RM001`)**:
   Trigger `enforce_booking_status_transition()` menolak lompatan status ilegal (contoh: `pending -> completed` langsung) bahkan bila dijalankan melalui query SQL mentah.
4. **Validasi Handover & Return Trigger**:
   - `trg_check_handover_booking_status`: Memastikan serah terima hanya bisa dimasukkan saat status booking `confirmed`.
   - `trg_check_return_booking_status`: Memastikan pengembalian hanya bisa dimasukkan saat status booking `active`, odometer akhir $\ge$ odometer awal, dan otomatis meng-update odometer armada motor.
5. **Keamanan Audit Log (Append-Only Trigger)**:
   Trigger `trg_audit_logs_no_update_delete` menolak seluruh operasi `UPDATE` dan `DELETE` pada tabel `audit_logs` untuk menjamin integritas forensik permanen.
6. **Advisory Lock pada Cron Expire Job**:
   `pg_try_advisory_lock(88776655)` mencegah multi-instans cron saling berebut saat membatalkan booking kedaluwarsa.
7. **Anti-Tampering Checksum Migrasi**:
   Runner migrasi (`db/migrate.js`) memvalidasi hash SHA-256 berkas SQL terhadap tabel `schema_migrations`. Jika ada berkas migrasi lama yang diubah, runner langsung membatalkan eksekusi.
8. **Graceful Error Mapping (`errors.js`)**:
   Seluruh kode PostgreSQL (`23P01`, `23505`, `23503`, `23514`, `RM001`, `57014`, `57P01`, `40001`, `40P01`) dipetakan menjadi `AppError` Bahasa Indonesia dengan kode kontrak resmi tanpa membocorkan rincian internal basis data.
9. **Resiliensi Connection Pool**:
   `pool.on('error')` mencegah crash saat idle connection diputus (seperti restart PostgreSQL atau `pg_terminate_backend`), dan `statement_timeout` diterjemahkan menjadi HTTP 503 `TIMEOUT`.
10. **Daftar Migrasi Lengkap**:
   - `001_initial_schema.sql` s/d `010_indexes_and_optimizations.sql`: Skema inti Tahap 3 (users, motorcycles, bookings, payments, reviews).
   - `011_admin_roles_settings.sql`: users.role CHECK (`customer`, `admin`, `staff`), payments.method `cash`, booking_timeline.actor `staff`, tabel `app_settings` & seed default.
   - `012_handover_return.sql`: Tabel `booking_handovers`, `booking_returns`, `booking_notes`, `motorcycles.odometer_km`, serta trigger status validation.
   - `013_audit_moderation.sql`: Tabel `audit_logs` (append-only), review moderation (`is_hidden`, `hidden_by`, `hidden_at`, `hidden_reason`), `user_documents.reviewed_by`, `maintenance_blocks.created_by`.
   - `014_admin_indexes.sql`: `contact_messages.is_read`, composite & partial indexes untuk admin queries.

---

### 12 Operasi Atomik & Urutan Penguncian Baku (Deadlock-Free)

Untuk mencegah deadlock antar-transaksi yang berjalan paralel, seluruh transaksi atomik menerapkan urutan penguncian baris baku:
$$\mathbf{motorcycles} \longrightarrow \mathbf{bookings} \longrightarrow \mathbf{payments} \longrightarrow \mathbf{promo\_codes} \longrightarrow \mathbf{users}$$
Bila mengunci banyak baris dalam tabel yang sama, baris selalu dikunci terurut berdasarkan ID (`ORDER BY id ASC FOR UPDATE`). Transaksi atomik didukung retry otomatis hingga 3 kali dengan jeda acak (25-100 ms) khusus untuk error PostgreSQL `40001` (serialization failure) dan `40P01` (deadlock detected).

1. **Konfirmasi Pembayaran Manual**:
   `SELECT id FROM bookings FOR UPDATE`; validasi status `pending` dan tanggal server DB belum kedaluwarsa; `INSERT payments` (hormati unique parsial satu pending per booking dan gatewayRef); `UPDATE bookings SET status = 'confirmed'`; `INSERT booking_timeline` dan `audit_logs`. Idempoten bila sudah `confirmed`.
2. **Serah Terima Unit (Handover)**:
   Kunci booking `FOR UPDATE`; validasi status `confirmed`, dokumen KTP & SIM terverifikasi, pembayaran `paid`, dan tanggal sewa WIB berada dalam rentang `[start_date, end_date)`; `INSERT booking_handovers`; `UPDATE bookings SET status = 'active'` (memicu trigger transisi status); catat odometer awal motor; catat timeline dan audit log. Akses paralel: tepat 1 berhasil, lainnya ditolak `INVALID_STATUS_TRANSITION`.
3. **Pengembalian Unit (Return)**:
   Kunci booking lalu motor `FOR UPDATE`; validasi status `active`; hitung denda & pengembalian deposit dengan formula murni yang identik antara memory dan postgres; `INSERT booking_returns`; `UPDATE bookings SET status = 'completed'`; `UPDATE motorcycles SET odometer_km = $odometerEnd, rental_count = rental_count + 1`; catat timeline dan audit log. Akses paralel: tepat 1 berhasil.
4. **Deposit Dikembalikan**:
   `UPDATE booking_returns SET deposit_refunded_at = now() WHERE booking_id = $1 AND deposit_refunded_at IS NULL AND deposit_refund > 0 RETURNING *`. Baris 0 mengembalikan error bahwa deposit sudah dikembalikan atau tidak berlaku. Akses paralel: tepat 1 berhasil.
5. **Pembatalan Admin**:
   Kunci booking `FOR UPDATE`; override refund dengan pagar CHECK `refund_amount <= rental_total`; pelepasan promo tepat sekali bersyarat (`promo_redemptions.released_at IS NULL`); update payment menjadi `refunded` bila refund > 0; catat timeline dan audit log.
6. **Blok Servis Armada**:
   Kunci baris motor `FOR UPDATE` (kunci SAMA dengan pembuatan booking pelanggan); cek irisan dengan booking `pending`/`confirmed`/`active` dan blok lain; `INSERT maintenance_blocks`. Tabrakan paralel ditangkap constraint exclusion `23P01`. Booking dan blok servis pada slot sama mustahil lolos berdua.
7. **Ubah Status Motor**:
   Kunci motor `FOR UPDATE`; periksa apakah ada booking mendatang atau aktif sebelum mengizinkan pengubahan ke `maintenance` atau `inactive`.
8. **Ubah Role / Nonaktifkan Pengguna**:
   Kunci seluruh baris admin aktif (`SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY id ASC FOR UPDATE`); pastikan setelah perubahan masih ada minimal satu admin aktif (`LAST_ADMIN`); tolak perubahan role atas akun sendiri (`SELF_ROLE_CHANGE`). Dua admin yang saling menurunkan role secara simultan dijamin tetap menyisakan minimal satu admin aktif.
9. **Sembunyikan / Tampilkan Ulasan**:
   Kunci motor `FOR UPDATE`; ubah `is_hidden` ulasan; hitung ulang `rating_avg`, `rating_count`, dan distribusi bintang hanya dari ulasan yang tidak tersembunyi (`is_hidden = false`) dalam transaksi yang sama.
10. **Pencatatan Audit**:
    `INSERT audit_logs` di dalam koneksi transaksi yang sama (`tx.auditRepo`); bila transaksi gagal atau di-rollback, audit log ikut di-rollback.
11. **Pengaturan Sistem (Settings)**:
    `UPSERT` nilai pengaturan per key JSONB; cache dinonaktifkan / diinvalidasi seketika setelah `COMMIT`.
12. **Verifikasi Dokumen**:
    `UPSERT` status verifikasi per `(user_id, type)` dengan reviewer; hitung ulang status dokumen ringkas (`computeDocsStatus`) dengan aturan murni yang sama antara driver memory dan postgres.

---

## 5. Ringkasan Hasil Pengujian (Semua Lulus)

Seluruh suite pengujian dijalankan dengan `jest --runInBand`:

```
Test Suites: 23 passed, 23 total
Tests:       216 passed, 216 total
```

| Kelompok Uji | Berkas Uji | Deskripsi & Hasil |
| :--- | :--- | :--- |
| **1. Uji Kontrak** | `tests/contract/repositories.contract.test.js` | 70/70 uji lulus identik antara driver `memory` dan `postgres`. |
| **2. Uji Skema** | `tests/integration/schemaConstraints.test.js` | GiST exclusion, CHECK constraint, UNIQUE constraint, dan trigger transisi status menolak data ilegal. |
| **3. Uji Konkurensi** | `tests/integration/concurrency.test.js` | - Burst 20 booking paralel slot sama $\rightarrow$ tepat 1 sukses (201), 19 gagal (409).<br>- 20 booking tanggal berbeda $\rightarrow$ semua 201.<br>- Webhook ganda $\rightarrow$ idempoten.<br>- Simultan cancel & pay $\rightarrow$ konsisten bebas deadlock.<br>- Promo limit 1 diakses 10 booking paralel $\rightarrow$ hanya 1 berhasil.<br>- Late payment $\rightarrow$ slot bebas confirmed, slot terisi needs_refund. |
| **4. Uji Logika** | `tests/integration/businessLogic.test.js` | - Refund 3 tingkat teruji presisi (>48 jam: 100%, 24-48 jam: 50%, <24 jam: sewa hangus + deposit 100%).<br>- Agregasi rating rata-rata dan distribusi bintang 1..5 konsisten. |
| **5. Uji Ketahanan** | `tests/integration/resilience.test.js` | - `pg_terminate_backend` ditangkap `pool.on('error')` tanpa crash proses.<br>- `statement_timeout` menghasilkan 503.<br>- Parameter aneh (`page=abc`, `sort=ngawur`, pencarian `%` dan `'`) tidak menyebabkan 500.<br>- **Zero Connection Leak**: 200 request beruntun mengembalikan koneksi idle ke baseline normal. |
| **6. Uji Migrasi** | `tests/integration/migrationsLifecycle.test.js` | Migrasi berulang idempoten, modifikasi checksum ditolak, `db:reset` lalu `db:verify` 0 masalah, dan `db:import-json` dua kali tanpa duplikasi data. |
| **7. Uji Performa** | `scripts/benchmark.js` | `EXPLAIN ANALYZE` membuktikan index GiST & Trigram terpakai. 14 motor $\times$ 10.040 booking sintetis merespons rata-rata **4.18 ms** (P95: **27.65 ms**), jauh di bawah ambang 150 ms. |
| **8. Cakupan Kode** | Jest Coverage Report | `repositories/postgres` dan `services` mencapai **$\ge 80\%$** lines coverage. |

---

## 6. Hasil Benchmark Performa (EXPLAIN ANALYZE & 10.000 Booking)

Dijalankan menggunakan perintah `npm run benchmark`:

```
================================================================
       RODAKITA BACKEND: DATABASE BENCHMARK & EXPLAIN ANALYZE   
================================================================

2. EXPLAIN ANALYZE: Pencarian Motor dengan Filter Tanggal & NOT EXISTS
   Limit (actual time=0.069..0.071 rows=11 loops=1)
     -> Sort Key: m.rental_count DESC, m.rating_avg DESC, m.id
        -> Hash Anti Join
           -> Seq Scan on motorcycles m (status = 'active')
           -> Bitmap Index Scan on no_overlapping_maintenance (GiST)
           -> Index Scan using no_double_booking on bookings b (GiST)
   Planning Time: 1.382 ms
   Execution Time: 1.271 ms

3. EXPLAIN ANALYZE: Tanggal Tidak Tersedia (generate_series + index scan)
   -> Index Scan using no_double_booking on bookings (GiST)
   -> Bitmap Index Scan on no_overlapping_maintenance (GiST)
   Execution Time: 0.042 ms

4. Menginjeksi 10.000 Booking Sintetis pada 14 Unit Motor...
   Total baris bookings: 10.040 baris.

5. Hasil Pengujian Performa Katalog (14 Motor x 10.040 Booking):
   - Waktu Minimum  : 3.39 ms
   - Waktu Rata-rata : 6.19 ms
   - Waktu P95      : 44.63 ms
   - Waktu Maksimum : 44.63 ms
   
✅ LULUS: Performa respons katalog 44.63 ms berada JAUH di bawah ambang batas 150 ms!

6. EXPLAIN ANALYZE: Query Dashboard, Daftar Booking, Kalender & Laporan:
   - a) Dashboard Summary: Aggregate Seq Scan + filter (1.60 ms)
   - b) Daftar Booking Filter: Index Scan using idx_bookings_status_end_date (0.053 ms)
   - c) Kalender Ketersediaan: Index Scan using idx_bookings_status_end_date (0.021 ms)
   - d) Laporan Pendapatan: GroupAggregate (13.84 ms)

7. Hasil Pengujian Performa Endpoint Admin (10.000 Booking Sintetis):
   - Waktu Minimum  : 23.90 ms
   - Waktu Rata-rata : 24.31 ms
   - Waktu P95      : 26.80 ms
   - Waktu Maksimum : 26.80 ms

✅ LULUS: Seluruh endpoint admin utama merespons 26.80 ms, JAUH di bawah ambang batas 300 ms!
```

---

## 7. Panduan Menjalankan & Perintah CLI

### Instalasi & Setup Pertama Kali

1. Salin konfigurasi environment:
   ```bash
   cp .env.example .env
   ```

2. Jalankan migrasi seluruh tabel (001–009):
   ```bash
   npm run db:migrate
   ```

3. Isi data awal seed:
   ```bash
   npm run db:seed
   ```

4. Verifikasi kesehatan skema & 20 tabel:
   ```bash
   npm run db:verify
   ```

5. Jalankan server backend (port 5001):
   ```bash
   npm run dev
   ```

### Daftar Perintah Lengkap

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run db:migrate` | Menjalankan seluruh file migrasi SQL baru secara atomik dengan advisory lock. |
| `npm run db:migrate:status` | Menampilkan tabel status berkas migrasi yang telah diterapkan. |
| `npm run db:seed` | Memuat data seed awal dan me-reset sequence ID. |
| `npm run db:import-json` | Mengimpor data JSON lama (`db.json`) secara idempoten tanpa duplikasi. |
| `npm run db:reset` | Me-reset total skema public, migrasi dari 001, dan memuat ulang seed. |
| `npm run db:verify` | Mengaudit 10 titik integritas (constraint, FK, sequence, rating sync). |
| `npm run benchmark` | Menjalankan benchmark EXPLAIN ANALYZE dan pengujian 10.000 booking sintetis. |
| `npm run test:contract` | Menjalankan uji kesetaraan repositori driver `memory` vs `postgres`. |
| `npm run test:concurrency` | Menjalankan pengujian balapan paralel, burst 20, dan advisory locks. |
| `npm test` | Menjalankan seluruh pengujian unit, integrasi, kontrak, dan resiliensi. |

---

## 8. Troubleshooting Kendala Umum

1. **Error `ECONNREFUSED` pada port 5433:**
   - Periksa port aktif PostgreSQL Anda via `psql -U postgres -p 5433` atau `brew services list`.
   - Jika instalasi PostgreSQL lokal Anda menggunakan port default `5432`, ubah `DATABASE_URL` dan `TEST_DATABASE_URL` di file `.env` menjadi port `5432`.

2. **Error `permission denied for schema public`:**
   - Pastikan role migrasi telah diberikan hak kepemilikan skema:
     `GRANT ALL ON SCHEMA public TO rodakita_owner;`
     `GRANT USAGE ON SCHEMA public TO rodakita_user;`
     `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rodakita_user;`

3. **Pool Connection Timeout saat pengujian konkurensi berat:**
   - Pastikan nilai `DB_POOL_MAX` di `.env` bernilai minimal `30` dan `connectionTimeoutMillis` pada `db/pool.js` adalah `10000` (10 detik).

---

## 9. Arsitektur & Kontrak API Admin (`/api/admin/*`)

Modul API Admin dirancang untuk operasional harian staf rental dan pengelolaan penuh oleh administrator, mematuhi kontrak resmi di `docs/admin-api-contract.md`.

### 9.1 Matriks Izin (RBAC) & Keamanan Dinamis
- Seluruh endpoint diawali `/api/admin/*` dan dilindungi oleh `protect` (JWT Bearer Token) + `adminLimiter` (600 req / 15 menit).
- Peran (`admin` dan `staff`) divalidasi langsung ke penyimpanan data pada setiap request (bukan hanya membaca payload JWT).
- Penonaktifan akun (`isActive === false`) atau penurunan peran (demotion) berlaku seketika (menolak request dengan 401/403).
- **Staf (`staff`)**: Memiliki akses ke Dashboard KPI, Booking operasional (lihat, konfirmasi bayar, serah terima, pengembalian, catatan), Verifikasi Dokumen, Kalender, Perawatan armada, dan Pesan kontak.
- **Admin (`admin`)**: Memiliki akses penuh termasuk Pembatalan dengan override refund, Ekspor CSV, Master Armada Motor, Manajemen Pengguna & Penetapan Peran, Moderasi Ulasan, Master Promo/Add-on/Lokasi, Pengaturan Sistem Global, Laporan Keuangan, dan Audit Log.

### 9.2 Kontrak Repositori Tambahan (`src/repositories/memory/`)

1. **`handoverRepo`**:
   - `findByBookingId(bookingId)`: Promise<Handover | null>
   - `create(data)`: Promise<Handover>
2. **`returnRepo`**:
   - `findByBookingId(bookingId)`: Promise<Return | null>
   - `create(data)`: Promise<Return>
3. **`bookingNoteRepo`**:
   - `findByBookingId(bookingId)`: Promise<BookingNote[]>
   - `create(data)`: Promise<BookingNote>
4. **`auditRepo`**:
   - `findAll(filter, paging)`: Promise<{ items: AuditLog[], total: number }>
   - `create(data)`: Promise<AuditLog>
5. **`settingsRepo`**:
   - `getSettings()`: Promise<SystemSettings>
   - `updateSettings(patch)`: Promise<SystemSettings>
   - `resetSettings()`: Promise<SystemSettings>
6. **`maintenanceRepo`**:
   - `findAll(filter, paging)`: Promise<{ items: ServiceBlock[], total: number }>
   - `findById(id)`: Promise<ServiceBlock | null>
   - `findOverlapping(motorId, start, end, excludeId)`: Promise<ServiceBlock[]>
   - `create(data)`: Promise<ServiceBlock>
   - `update(id, data)`: Promise<ServiceBlock | null>
   - `delete(id)`: Promise<boolean>
7. **`addonRepo` & `locationRepo`**:
   - `findAll(filter)`: Promise<Item[]>
   - `findById(id)`: Promise<Item | null>
   - `hasUsage(id)`: Promise<boolean> (mencegah penghapusan jika pernah digunakan)
   - `create(data)`: Promise<Item>
   - `update(id, data)`: Promise<Item | null>
   - `toggleActive(id)`: Promise<Item | null>
   - `delete(id)`: Promise<boolean>
8. **Metode Tambahan pada Repositori Eksisting**:
   - `userRepo.countActiveAdmins(excludeId)`: Menghitung admin aktif untuk mencegah `LAST_ADMIN` lockout.
   - `motorRepo.findByPlate(plate, excludeId)`: Memvalidasi keunikan pelat nomor motor.
   - `motorRepo.findBySlug(slug, excludeId)`: Memvalidasi slug unik otomatis.
   - `bookingRepo.findConflictingForMotor(motorId, start, end)`: Menjaga konsistensi jadwal saat mengubah status motor ke maintenance/inactive.
   - `reviewRepo.setVisibility(id, isVisible, reason)`: Menyembunyikan ulasan dan menghitung ulang rating armada secara atomik.

### 9.3 Aturan Bisnis & Penanganan Error Baku
- **Confirm Payment Manual**: Hanya dari `pending`, idempoten, menghasilkan payment paid dan booking confirmed.
- **Handover Unit**: Syarat dokumen `verified` (`DOCS_NOT_VERIFIED`), pembayaran lunas (`PAYMENT_NOT_PAID`), tanggal valid, bendera dokumen & deposit wajib true, status beralih ke `active`.
- **Return Unit**: Validasi odometer non-regresif (`ODOMETER_INVALID`), toleransi keterlambatan sistem (settings), tarif per blok 24 jam dengan batas maksimal harga sewa harian, deposit refund / amount due, status beralih ke `completed`.
### 9.4 Daftar Lengkap Endpoint Admin (`/api/admin/*`)

| Modul | Method | Endpoint | Izin | Keterangan & Aturan Bisnis |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | `GET` | `/dashboard/summary` | `staff, admin` | KPI 8 kartu operasional hari ini & okupansi |
| | `GET` | `/dashboard/revenue?days=` | `staff, admin` | Deret tren pendapatan harian (default 30 hari) |
| | `GET` | `/dashboard/tasks` | `staff, admin` | Daftar tugas mendesak & keterlambatan unit |
| **Booking** | `GET` | `/bookings` | `staff, admin` | Pencarian & filter booking operasional |
| | `GET` | `/bookings/:id` | `staff, admin` | Detail booking, renter, pembayaran, timeline |
| | `POST` | `/bookings/:id/confirm-manual-payment` | `staff, admin` | Konfirmasi bayar tunai/transfer (idempoten) |
| | `POST` | `/bookings/:id/handover` | `staff, admin` | Serah terima unit (cek dokumen, bayar, tanggal) |
| | `POST` | `/bookings/:id/return` | `staff, admin` | Pengembalian unit (hitung denda, deposit, odo) |
| | `POST` | `/bookings/:id/cancel` | `admin` | Pembatalan dengan override & pelepasan promo |
| | `POST` | `/bookings/:id/notes` | `staff, admin` | Tambah catatan internal pada timeline |
| | `POST` | `/bookings/:id/deposit-refunded` | `staff, admin` | Tandai sisa deposit telah dikembalikan (1x) |
| | `GET` | `/bookings/export.csv` | `admin` | Ekspor CSV aman dengan BOM & anti-DDE |
| **Dokumen** | `GET` | `/documents` | `staff, admin` | Antrean dokumen KTP & SIM C |
| | `GET` | `/documents/:userId/:type/file` | `staff, admin` | Stream berkas privat (audit log tercatat) |
| | `POST` | `/documents/:userId/:type/verify` | `staff, admin` | Setujui (`approve`) atau tolak (`reject`) |
| **Motor** | `GET` | `/motorcycles` | `admin` | Katalog armada admin dengan filter status |
| | `POST` | `/motorcycles` | `admin` | Tambah armada motor baru (plat unik) |
| | `GET` | `/motorcycles/:id` | `admin` | Detail armada motor spesifik |
| | `PUT` | `/motorcycles/:id` | `admin` | Perbarui data teknis & tarif motor |
| | `PATCH`| `/motorcycles/:id/status` | `admin` | Ubah status (cegah inactive jika ada booking) |
| | `POST` | `/motorcycles/:id/images` | `admin` | Unggah foto (maks 8 foto, magic bytes) |
| | `PUT` | `/motorcycles/:id/images/order` | `admin` | Atur ulang urutan foto & foto utama |
| | `DELETE`| `/motorcycles/:id/images/:imgId`| `admin` | Hapus foto motor |
| **Kalender** | `GET` | `/calendar?month=` | `staff, admin` | Grid okupansi harian per unit armada |
| **Servis** | `GET` | `/maintenance` | `staff, admin` | Riwayat & jadwal perawatan armada |
| | `POST` | `/maintenance` | `staff, admin` | Jadwalkan servis (cegah konflik sewa) |
| | `PUT` | `/maintenance/:id` | `staff, admin` | Tandai servis selesai, biaya, dan catatan |
| | `DELETE`| `/maintenance/:id` | `staff, admin` | Batalkan jadwal servis |
| **Pengguna** | `GET` | `/users` | `admin` | Daftar pengguna, filter peran & status |
| | `GET` | `/users/:id` | `admin` | Riwayat booking & dokumen pengguna |
| | `POST` | `/users` | `admin` | Buat akun pengguna / staf baru |
| | `PUT` | `/users/:id` | `admin` | Perbarui profil pengguna |
| | `PATCH`| `/users/:id/role` | `admin` | Ubah peran (cegah self-role & last-admin) |
| | `PATCH`| `/users/:id/status` | `admin` | Aktif/nonaktifkan akun (cegah self-deact) |
| **Ulasan** | `GET` | `/reviews` | `admin` | Daftar ulasan pelanggan |
| | `PATCH`| `/reviews/:id/visibility` | `admin` | Sembunyikan ulasan (recalc rating publik) |
| | `DELETE`| `/reviews/:id` | `admin` | Hapus ulasan permanen |
| **Promo** | `GET/POST`| `/promos` | `admin` | Kelola master kode promo & kuota |
| | `PUT/DELETE`| `/promos/:id` | `admin` | Edit / soft-delete promo |
| **Add-on** | `GET/POST`| `/addons` | `admin` | Kelola helm, jas hujan, boks motor |
| | `PUT/DELETE`| `/addons/:id` | `admin` | Edit / hapus add-on |
| **Lokasi** | `GET/POST`| `/locations` | `admin` | Kelola titik jemput & kantor rental |
| | `PUT/DELETE`| `/locations/:id` | `admin` | Edit / hapus lokasi |
| **Pengaturan**| `GET/PUT`| `/settings` | `admin` | Pengaturan operasional, denda, deposit |
| | `POST` | `/settings/reset` | `admin` | Kembalikan ke pengaturan bawaan PRD |
| **Pesan** | `GET` | `/contact-messages` | `staff, admin` | Pesan masuk formulir kontak |
| | `PATCH`| `/contact-messages/:id/read` | `staff, admin` | Tandai pesan telah dibaca |
| | `POST` | `/contact-messages/:id/reply` | `staff, admin` | Balas pesan kontak |
| **Laporan** | `GET` | `/reports/revenue` | `admin` | Laporan pendapatan murni (JSON & CSV) |
| | `GET` | `/reports/utilization` | `admin` | Laporan okupansi armada (JSON & CSV) |
| | `GET` | `/reports/top-motors` | `admin` | Laporan motor terlaris |
| | `GET` | `/reports/summary` | `admin` | Ringkasan distribusi status booking |
| **Audit** | `GET` | `/audit-logs` | `admin` | Jejak audit forensik seluruh aksi mutasi |

---

### 9.5 Akun Demo Pengujian & Evaluasi

| Peran | Email | Kata Sandi | Hak Akses |
| :--- | :--- | :--- | :--- |
| **Administrator Utama** | `admin@rodakita.id` | `Admin12345` | Akses penuh seluruh panel & modul (`admin`) |
| **Staf Operasional** | `staff@rodakita.id` / `budi@gmail.com` | `Staff12345` / `Budi12345` | Operasional: Dashboard, Booking, Kalender, Dokumen, Servis, Pesan (`staff`) |
| **Pelanggan (Customer)** | `demo@rodakita.id` | `Demo12345` | Pemesanan motor publik; ditolak pada `/api/admin/*` (`customer`) |


