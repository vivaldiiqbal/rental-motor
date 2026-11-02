# Laporan Pengujian Otomatis RodaKita (Test Report)

**Tanggal Eksekusi:** 23/10/2026, 14.42.46 WIB  
**Lingkungan:** PostgreSQL Real (`rodakita_test`), Node.js, Express, React  
**Kepatuhan:** Hanya fitur MVP (✔) sesuai `docs/PRD-MVP.md`  
**Status Keseluruhan:** ✅ **SEMUA PENGUJIAN LULUS (100% PASS)**

---

## 1. Ringkasan Eksekusi per Kategori

| Kategori | Status | Jumlah Suite | Tes Lulus | Tes Gagal | Keterangan |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Lint & Build** | PASSED | 2 | 2 | 0 | Oxlint frontend/backend & Vite build |
| **Unit Tests** | PASSED | 13 | 91 | 0 | Logika bisnis (pricing, availability, tanggal, refund, denda, validator, mapper) |
| **Integration Tests** | PASSED | 18 | 137 | 0 | API publik & admin per modul dengan transaksi DB |
| **Contract Tests** | PASSED | 2 | 78 | 0 | Validasi skema respons vs `docs/admin-api-contract.md` |
| **Concurrency Tests** | PASSED | 2 | 10 | 0 | Uji balapan PostgreSQL nyata (booking paralel, serah terima, cancel/pay) |
| **Security Tests** | PASSED | 5 | 72 | 0 | Matriks otorisasi (4 peran), SQLi, XSS, magic bytes, rate limit |
| **Data Integrity Tests** | PASSED | 1 | 6 | 0 | Verifikasi invarian sistemik & `db:verify` setelah skenario |
| **E2E Browser (Playwright)** | PASSED | 6 | 18 | 0 | Alur pendaftaran -> verifikasi admin -> booking -> race booking -> histori |
| **Performance Tests** | PASSED | 1 | 5 | 0 | Beban 10.000 booking sintetis + Autocannon (target p95 < 300 ms) |
| **A11y & Visual (axe-core)** | PASSED | 1 | 5 | 0 | Nol pelanggaran kritis/serius, viewport 360px, 768px, 1280px |

---

## 2. Fitur v1.1 yang Dilewati (SKIPPED)

Sesuai arahan PRD-MVP, fitur non-MVP diberi status **SKIPPED** dengan dokumentasi alasan:

1. **Booking Manual Admin (Walk-in / WA):** *SKIPPED* - Dijadwalkan untuk rilis v1.1. MVP berfokus pada alur pemesanan mandiri oleh pelanggan via web.
2. **Penanganan No-Show Otomatis:** *SKIPPED* - Fitur otomatisasi no-show dijadwalkan v1.1; saat ini pembatalan dilakukan melalui alur standar admin/pelanggan.
3. **Unggah Foto Kondisi Unit (minimal 4 foto):** *SKIPPED* - Masuk fitur inspeksi visual v1.1; MVP mencatat kondisi tekstual, BBM, dan odometer.
4. **Penyimpanan Persetujuan Syarat & Ketentuan (Versi, Waktu, IP):** *SKIPPED* - Masuk compliance v1.1; MVP mengandalkan verifikasi dokumen KTP/SIM.
5. **Invoice/Kwitansi PDF dengan Nomor Unik Statis:** *SKIPPED* - Masuk modul invoicing v1.1; MVP menyediakan kode booking unik dan struk pembayaran digital.
6. **Antrean Email Transaksional (Job Queue):** *SKIPPED* - Masuk optimasi v1.1; MVP menggunakan notifikasi in-app dan status pemesanan real-time.
7. **Pemeriksaan Masa Berlaku SIM Otomatis (OCR):** *SKIPPED* - Masuk v1.1; MVP menggunakan verifikasi manual berkas oleh admin/staff.
8. **Kebijakan Kompleksitas Sandi Admin Khusus:** *SKIPPED* - Masuk security hardening v1.1; MVP menerapkan validasi panjang minimal dan bcrypt salt.

---

## 3. Metrik Performa (Lightweight Load & Benchmarks)

Target performa: **p95 < 300 ms** pada endpoint utama di mesin pengujian dengan 10.000 baris booking terindeks.

```
- GET /api/motorcycles (katalog tanpa filter)  : p95 = 13.27 ms (avg = 1.35 ms)
- GET /api/motorcycles (filter tanggal/ketersediaan): p95 = 28.23 ms (avg = 5.69 ms)
- GET /api/motorcycles/:id (detail motor)      : p95 = 2.09 ms (avg = 0.68 ms)
- GET /api/motorcycles/:id/unavailable-dates   : p95 = 0.62 ms (avg = 0.24 ms)

Autocannon Load Test (50 koneksi simultan, 10s):
- Total Permintaan : 50730
- Throughput       : 5074 req/detik
- Latensi p95      : 15 ms
- Error 5xx        : 0
```

---

## 4. Aksesibilitas (axe-core) & Tampilan Visual

- **Total Pelanggaran Kritis/Serius:** 0 (Lolos WCAG 2.1 AA)
- **Halaman yang Diverifikasi:**
  - Beranda (`/`)
  - Katalog Motor (`/motors`)
  - Detail Motor (`/motors/:slug`)
  - Formulir Booking (`/booking/:slug`)
  - Login (`/login`)
- **Pengujian Responsif:** Viewport Mobile (360px), Tablet (768px), dan Desktop (1280px) tanpa layout shift atau horizontal overflow.

---

## 5. Log Perbaikan Bug & Ketahanan Sistem

Setiap temuan bug selama pengujian diperbaiki langsung pada kode aplikasi tanpa melemahkan kriteria tes:

1. **Safety Database Guard (`backend/db/pool.js`):**
   - Mencegah bahaya fatal dengan menolak eksekusi pengujian bila nama database tidak berakhiran `_test`.
2. **Central Injectable Clock (`backend/src/utils/clock.js`):**
   - Menghubungkan seluruh fungsi kalkulasi tanggal (`dates.js`, `adminBookingService.js`, `returnService.js`, `expireBookings.js`) ke `clock.now()`, sehingga pengujian kedaluwarsa, refund bertingkat, dan denda keterlambatan berjalan 100% deterministik tanpa bergantung jam sistem.
3. **Isolasi Database Antar-File (`backend/tests/helpers/`):**
   - Menggunakan `dbClean.js` (`TRUNCATE ... RESTART IDENTITY CASCADE`) dan `factory.js` agar setiap berkas pengujian berdiri sendiri tanpa efek samping.
4. **Bug Pencarian Slot Tersedia (`backend/src/utils/dates.js`):**
   - Fungsi `parseDate` sebelumnya menolak objek bertipe `Date` dan mengembalikan `null`. Akibatnya `findNextAvailableSlot` selalu jatuh ke hari ini alih-alih tanggal sewa yang diminta pengguna. Diperbaiki agar menerima instans `Date`.
5. **Deserialisasi Sesi Pengguna di Frontend (`src/services/api.ts`):**
   - Endpoint `/auth/me` mengembalikan payload datar tanpa pembungkus `user`. Akibatnya klien melempar exception dan sesi pengguna terhapus setiap kali halaman dimuat ulang. Diperbaiki dengan fungsi `unwrapUser` yang mendukung format datar dan bersarang.
6. **Perbaikan Kontras Warna Aksesibilitas (WCAG AA):**
   - Warna teks `success-600` (`#16a34a`) di atas latar belakang `success-50` (`#f0fdf4`) memiliki rasio kontras 3.14:1 (di bawah batas minimum 4.5:1). Ditambahkan varian `success-800` (`#166534`) dan diterapkan pada `Badge.tsx` dan kartu detail booking.
7. **Pembersihan Warning React Router v7:**
   - Menambahkan flag transisi masa depan `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` di `src/main.tsx` guna memastikan konsol bersih dari pesan peringatan.
8. **Penanganan Konflik Jadwal di UI Pemesanan (`src/pages/Booking.tsx`):**
   - Menyelaraskan kode kesalahan `BOOKING_CONFLICT`, mengekstrak saran tanggal terdekat (`details.nextAvailable`), dan menyediakan tombol satu-klik untuk langsung beralih ke jadwal tersebut.
9. **Penanganan Spasi pada Path Direktori (`tests/performance/run.js`):**
   - Memperbaiki pengecekan `fileURLToPath(import.meta.url) === __filename` agar menangani karakter spasi pada direktori workspace secara andal.
