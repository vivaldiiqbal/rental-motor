# Laporan Baseline Sebelum Perbaikan (Tahap 0)

Tanggal Pengujian: 2 November 2026  
Cabang Git: `fix/admin-motors-list`

---

## 1. Ringkasan Eksekutif

| Komponen | Status | Lulus | Gagal | Dilewati | Catatan |
|---|---|---|---|---|---|
| **Backend Unit & Integration Tests** | SEBAGIAN GAGAL (Ada bawaan) | 557 | 1 | 0 | 56 Test Suites lulus, 1 Test Suite gagal |
| **Frontend Lint (`oxlint`)** | LULUS | 512 berkas diperiksa | 0 error | 0 | 264 warnings (tidak menghalangi) |
| **Frontend Build (`tsc -b && vite build`)** | LULUS | Berhasil | 0 error | 0 | Waktu build: ~960ms |

---

## 2. Detail Pengujian Backend (`cd backend && npm test`)

- **Total Test Suites**: 57
  - Lulus: 56
  - Gagal: 1 (`tests/integration/dynamicPricing.test.js`)
- **Total Tests**: 558
  - Lulus: 557
  - Gagal: 1
- **Waktu Eksekusi**: 63.627 s

### Kegagalan yang Sudah Ada Sebelumnya (Pre-existing Failure):
```text
FAIL tests/integration/dynamicPricing.test.js
  ● Integration Test: Dynamic Pricing Rules, Tiers & Booking Snapshot Immutability › 4. Booking Pricing Snapshot Immutability › Booking lama tidak berubah saat admin mengubah atau menaikkan aturan harga

    expect(received).toBe(expected) // Object.is equality

    Expected: 201
    Received: 403

      274 |         console.error('BOOKING ERROR:', JSON.stringify(bookingRes.body, null, 2));
      275 |       }
    > 276 |       expect(bookingRes.status).toBe(201);
          |                                 ^
```
*Penyebab kegagalan lama*: Uji coba ini membuat pemesanan langsung tanpa profil pengguna terverifikasi lengkap (`validRenter` belum mencakup status dokumen yang disyaratkan gate verifikasi profil Rilis 1).

---

## 3. Detail Frontend Lint & Build

1. `npx oxlint`
   - Hasil: 0 error, 264 warnings (selesai dalam 138ms pada 512 berkas).
2. `npm run build`
   - Kompilasi TypeScript (`tsc -b`): Lulus tanpa galat tipe.
   - Vite Bundle: Selesai tanpa galat.

---

## 4. Status Kondisi Awal Halaman `/admin/motors` (Baseline Bug)
- Muncul 4-6 toast beruntun: `"Data motor tidak ditemukan."`
- Kolom Plat Nomor menampilkan `"-"` untuk semua motor.
- Kolom Status kosong / tidak terisi.
- Permintaan jaringan memanggil endpoint katalog publik `/api/motors` alih-alih endpoint admin khusus `/api/admin/motorcycles`.
