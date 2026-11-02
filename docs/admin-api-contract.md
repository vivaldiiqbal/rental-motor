# Dokumen Kontrak API Admin RodaKita (Panel Admin)

**Versi:** 1.0  
**Tanggal:** 22 Oktober 2026  
**Base URL:** `/api/admin`  
**Format Pertukaran:** JSON (`application/json`) & CSV (`text/csv` untuk ekspor laporan/booking)  
**Zona Waktu:** Asia/Jakarta (WIB, UTC+7)  
**Mata Uang:** Rupiah (IDR)  

---

## 1. Ikhtisar Otentikasi & Otorisasi

Setiap permintaan ke endpoint `/api/admin/*` wajib menyertakan token otentikasi (Bearer Token / Cookie Sesi HTTP-Only) dengan umur sesi maksimal 8 jam.

### Peran Pengguna (Roles):
- **`admin`**: Pemilik / Kepala Cabang. Memiliki hak penuh atas konfigurasi armada, pengguna, promosi, pengaturan sewa, laporan keuangan, pembatalan refund, dan audit log.
- **`staff`**: Petugas Lapangan / Front Desk. Memiliki izin operasional harian: dashboard, konfirmasi pembayaran manual, serah terima unit, pengembalian unit & hitung denda, verifikasi dokumen, kalender sewa, pemblokiran servis, dan pesan kontak.
- **`customer`**: Pengguna publik. **Ditolak** (403 Forbidden) jika mengakses `/api/admin/*`.

---

## 2. Standar Respons & Penanganan Kesalahan

### Format Respons Sukses (Standard Envelope):
```json
{
  "success": true,
  "data": { ... } | [ ... ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 10,
    "totalPages": 12
  }
}
```

### Format Respons Gagal (Error Envelope):
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Deskripsi kesalahan yang ramah bagi pengguna dalam Bahasa Indonesia",
    "details": { ... }
  }
}
```

### Kamus Kode Error Standar Bisnis:
| Kode Error | HTTP Status | Keterangan & Aturan Bisnis Terkait |
| :--- | :---: | :--- |
| `UNAUTHORIZED` | 401 | Sesi tidak valid, token kedaluwarsa, atau pengguna belum masuk. |
| `FORBIDDEN_ROLE` | 403 | Peran pengguna (`staff`) tidak memiliki izin mengakses modul/aksi khusus `admin`. |
| `RESOURCE_NOT_FOUND` | 404 | Entitas yang diminta (id booking, motor, user, pesan) tidak ditemukan. |
| `BOOKING_NOT_FOUND` | 404 | Booking dengan ID numerik atau Kode booking tertentu tidak ditemukan di database. |
| `BOOKING_EXPIRED` | 409 | Booking telah kedaluwarsa dan tidak dapat dikonfirmasi pembayarannya. |
| `DOCS_NOT_VERIFIED` | 400 | Serah terima unit ditolak karena dokumen KTP atau SIM C penyewa belum terverifikasi. |
| `PAYMENT_NOT_PAID` | 400 | Serah terima unit ditolak karena status pembayaran sewa belum `paid` (lunas). |
| `INVALID_STATUS_TRANSITION`| 409 | Perpindahan status booking tidak sah (misal: pending langsung return, bukan pending saat konfirmasi, atau completed dibatalkan). |
| `ODOMETER_INVALID` | 400 | Odometer saat pengembalian lebih kecil dari odometer saat serah terima. |
| `MOTOR_HAS_BOOKINGS` | 409 | Motor tidak dapat dinonaktifkan atau diservis karena memiliki reservasi aktif/mendatang. |
| `MAINTENANCE_CONFLICT` | 409 | Jadwal servis menabrak rentang tanggal booking pelanggan yang berstatus pending/confirmed/active. |
| `LAST_ADMIN` | 400 | Dilarang menonaktifkan atau mengubah peran admin terakhir dalam sistem. |
| `SELF_ROLE_CHANGE` | 400 | Administrator dilarang mengubah perannya sendiri untuk mencegah penguncian akun tidak sengaja. |
| `SELF_DEACTIVATION` | 400 | Administrator dilarang menonaktifkan akunnya sendiri. |
| `PROFILE_INCOMPLETE` | 403 | Profil penyewa (KTP, tanggal lahir, kontak darurat, persetujuan syarat/GPS) belum lengkap saat mengajukan booking. |
| `VALIDATION_ERROR` | 422 | Parameter atau input formulir tidak valid (misal: email salah, nomor polisi duplikat). |

---

## 3. Spesifikasi Endpoint

### 3.1 Dashboard & Tugas Operasional

#### 1. `GET /api/admin/dashboard/summary`
- **Izin:** `staff` & `admin`
- **Tujuan:** Mendapatkan metrik kartu KPI utama operasional dan tren bulanan.
- **Parameter:** Tidak ada.
- **Respons (200 OK):**
```json
{
  "success": true,
  "data": {
    "todayPickups": 4,
    "todayReturns": 3,
    "activeRentals": 12,
    "pendingPayment": 2,
    "pendingDocuments": 5,
    "overdueRentals": 1,
    "monthlyRevenue": 14500000,
    "revenueGrowthPercent": 12.5,
    "occupancyRate30Days": 78.4
  }
}
```
- **Aturan Bisnis:** 
  - `overdueRentals` menghitung booking berstatus `active` yang `endDate` + `pickupTime` telah lewat dari waktu sekarang (WIB). Ditampilkan mencolok dengan warna merah di UI.
  - Pendapatan TIDAK pernah menghitung uang deposit.

#### 2. `GET /api/admin/dashboard/revenue?days=`
- **Izin:** `admin` (Staff mendapatkan data ringkas operasional)
- **Tujuan:** Grafik tren pendapatan harian dalam kurun waktu N hari terakhir (default 30 hari).
- **Parameter Query:**
  - `days` (integer, default: 30)
- **Respons (200 OK):**
```json
{
  "success": true,
  "data": [
    { "date": "2026-10-01", "revenue": 450000, "bookingCount": 3 },
    { "date": "2026-10-02", "revenue": 600000, "bookingCount": 4 }
  ]
}
```

#### 3. `GET /api/admin/dashboard/tasks`
- **Izin:** `staff` & `admin`
- **Tujuan:** Mendapatkan daftar antrean tugas operasional mendesak hari ini.
- **Respons (200 OK):**
```json
{
  "success": true,
  "data": {
    "pickupsToday": [
      { "bookingId": "b-101", "bookingCode": "RK-2610-001", "renterName": "Ilham Ramadhan", "motorName": "Honda Vario 125", "time": "09:00" }
    ],
    "returnsToday": [
      { "bookingId": "b-102", "bookingCode": "RK-2610-002", "renterName": "Budi Santoso", "motorName": "Yamaha NMAX 155", "time": "17:00", "isOverdue": false }
    ],
    "pendingDocs": [
      { "userId": "u-cust-2", "userName": "Budi Santoso", "type": "ktp", "uploadedAt": "2026-10-21T18:40:00Z" }
    ],
    "overdueReturns": [
      { "bookingId": "b-102", "bookingCode": "RK-2610-002", "renterName": "Budi Santoso", "phone": "081987654321", "scheduledReturn": "2026-10-21 09:00 WIB" }
    ]
  }
}
```

---

### 3.2 Manajemen Transaksi Booking

#### 4. `GET /api/admin/bookings`
- **Izin:** `staff` & `admin`
- **Tujuan:** Menampilkan tabel riwayat dan antrean pemesanan motor dengan filter lengkap.
- **Parameter Query:**
  - `status` (`all` | `pending` | `confirmed` | `active` | `completed` | `cancelled`)
  - `startDate` (format: `YYYY-MM-DD`, opsional)
  - `endDate` (format: `YYYY-MM-DD`, opsional)
  - `motorId` (string, opsional)
  - `search` (string: kode booking, nama penyewa, no telepon)
  - `page` (integer, default: 1)
  - `limit` (integer, default: 10)
  - `sortBy` (`createdAt` | `startDate` | `total`, default: `createdAt`)
  - `sortOrder` (`asc` | `desc`, default: `desc`)
- **Respons (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "b-101",
      "code": "RK-2610-001",
      "renter": { "name": "Ilham Ramadhan", "phone": "081234567890", "email": "demo@rodakita.id" },
      "motor": { "id": "1", "name": "Honda Vario 125", "plate": "DK 4512 FB" },
      "startDate": "2026-10-20",
      "endDate": "2026-10-22",
      "days": 2,
      "total": 350000,
      "deposit": 200000,
      "status": "active",
      "paymentStatus": "paid",
      "paymentMethod": "transfer",
      "createdAt": "2026-10-19T11:00:00Z"
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "statusCounts": { "all": 45, "pending": 4, "confirmed": 6, "active": 12, "completed": 20, "cancelled": 3 }
  }
}
```

#### 5. `GET /api/admin/bookings/:id`
- **Izin:** `staff` & `admin`
- **Tujuan:** Detail lengkap transaksi, riwayat timeline, foto serah terima/kembali, status verifikasi dokumen, dan snapshot profil penyewa saat transaksi dibuat.
- **Parameter Jalur:** `:id` (Dapat berupa ID numerik database seperti `1036` atau Kode booking resmi seperti `RM-261023-9ZN4`)
- **Field Snapshot Penyewa (`renterSnapshot`):**
  Mengembalikan data resmi penyewa yang terkunci saat pemesanan dibuat (`fullNameKtp`, `phoneE164`, `nikLast4`, `birthDate`, `addressKtp`, `stayAddress`, `emergencyContact: { name, relation, phone }`, `termsVersionAccepted`, `gpsConsentAt`). Jika profil penyewa berubah di kemudian hari, panel admin membandingkan `renterSnapshot` dengan profil pengguna terkini dan menampilkan peringatan bila terdeteksi perbedaan.
- **Respons Error:** `404 Not Found` jika entitas tidak ada (`BOOKING_NOT_FOUND`).

#### 6. `POST /api/admin/bookings/:id/confirm-manual-payment`
- **Izin:** `staff` & `admin`
- **Tujuan:** Mengonfirmasi pembayaran tunai/transfer manual yang dilakukan pelanggan. Bersifat idempoten (jika sudah confirmed & paid, mengembalikan data sukses tanpa error).
- **Parameter Jalur:** `:id` (Dapat berupa ID numerik database atau Kode booking resmi)
- **Request Body:**
```json
{
  "paymentMethod": "transfer", // "cash" | "transfer" | "ewallet"
  "amount": 350000,
  "notes": "Transfer BCA a.n Ilham Ramadhan telah masuk rekening operasional"
}
```
- **Kode Error yang Mungkin:**
  - `BOOKING_NOT_FOUND` (404): Booking dengan ID atau Kode tersebut tidak ditemukan.
  - `INVALID_STATUS_TRANSITION` (409): Booking bukan berstatus `pending`.
  - `BOOKING_EXPIRED` (409): Booking telah melewati batas waktu kedaluwarsa (`expiresAt`).
- **Aturan Bisnis:** 
  - Hanya dapat dijalankan jika booking berstatus `pending`.
  - Mengubah `status` menjadi `confirmed`, `paymentStatus` menjadi `paid`.
  - Mencatat entri di timeline booking dan log audit.

#### 7. `POST /api/admin/bookings/:id/handover`
- **Izin:** `staff` & `admin`
- **Tujuan:** Mencatat serah terima kunci dan unit motor kepada penyewa.
- **Parameter Jalur:** `:id` (Dapat berupa ID numerik database atau Kode booking resmi)
- **Request Body:**
```json
{
  "startOdometer": 12450,
  "initialFuel": "Penuh (F)",
  "conditionNotes": "Bodi mulus, spion lengkap, 2 helm SNI diserahkan",
  "originalDocsChecked": true,
  "depositReceived": true,
  "photos": ["https://.../handover_front.jpg", "https://.../handover_odo.jpg"]
}
```
- **Kode Error yang Mungkin:**
  - `BOOKING_NOT_FOUND` (404): Booking tidak ditemukan.
  - `INVALID_STATUS_TRANSITION` (409): Booking belum berstatus `confirmed`.
  - `PAYMENT_NOT_PAID` (400): Pembayaran sewa belum lunas.
  - `DOCS_NOT_VERIFIED` (400): Dokumen identitas KTP/SIM C pelanggan belum berstatus `verified`.
  - `VALIDATION_ERROR` (422): `originalDocsChecked` atau `depositReceived` belum bernilai `true`.
- **Aturan Bisnis:**
  - Status berubah dari `confirmed` menjadi `active`.
  - Odometer awal dicatat permanen untuk divalidasi saat pengembalian.

#### 8. `POST /api/admin/bookings/:id/return`
- **Izin:** `staff` & `admin`
- **Tujuan:** Menyelesaikan sewa motor, mengecek kondisi akhir, dan menghitung otomatis penyesuaian deposit / denda.
- **Parameter Jalur:** `:id` (Dapat berupa ID numerik database atau Kode booking resmi)
- **Request Body:**
```json
{
  "returnTime": "2026-10-22T14:30:00+07:00",
  "endOdometer": 12580,
  "finalFuel": "Penuh (F)",
  "notes": "Unit kembali lengkap tanpa lecet",
  "damageFee": 0,
  "otherFee": 0
}
```
- **Kode Error yang Mungkin:**
  - `BOOKING_NOT_FOUND` (404): Booking tidak ditemukan.
  - `INVALID_STATUS_TRANSITION` (409): Booking bukan berstatus `active`.
  - `ODOMETER_INVALID` (400): Nilai `endOdometer` < `startOdometer`.
- **Aturan Bisnis Perhitungan Denda & Deposit:**
  - Jadwal pengembalian resmi = `endDate` jam `pickupTime` (WIB).
  - Toleransi keterlambatan = 120 menit (2 jam). Jika telat $\le$ 120 menit, denda = Rp 0.
  - Jika telat > 120 menit: Jam keterlambatan dihitung dari pembulatan ke atas menit keterlambatan dibagi 60.
  - Biaya per jam = `lateFeePercentPerHour` % dari harga sewa harian motor (default 10%).
  - Denda per hari dibatasi maksimal seharga 1 hari sewa motor penuh (`Math.min(dailyPrice, remHours * hourlyFee)`).
  - Total Potongan Deposit = `lateFee` + `damageFee` + `otherFee`.
  - `refundDeposit` = `Math.max(0, deposit - totalDeduction)`.
  - `underpayment` (kurang bayar) = `Math.max(0, totalDeduction - deposit)`. Jika biaya kerusakan melebihi deposit, muncul kurang bayar yang wajib ditagihkan ke pelanggan.
  - Status sewa berubah menjadi `completed`.

#### 9. `POST /api/admin/bookings/:id/cancel`
- **Izin:** `admin` (Staff dilarang keras membatalkan pemesanan yang sudah berbayar/paid)
- **Tujuan:** Membatalkan pemesanan dengan transaksi atomik dan keputusan refund manual oleh admin.
- **Parameter Jalur:** `:id` (Dapat berupa ID numerik database atau Kode booking resmi)
- **Request Body:**
```json
{
  "reason": "Pembatalan atas permintaan pelanggan",
  "version": 1, // opsional: nomor versi terakhir yang dilihat klien untuk optimistic concurrency
  "refundAmount": 250000 // wajib untuk booking berbayar (tidak melebihi total yang dibayar)
}
```
- **Kode Error yang Mungkin:**
  - `BOOKING_NOT_FOUND` (404): Booking tidak ditemukan.
  - `FORBIDDEN_ROLE` (403): Staf mencoba membatalkan booking berbayar.
  - `INVALID_STATUS_TRANSITION` (400): Status bukan `pending` atau `confirmed`.
  - `STALE_DATA` (409): Versi data pada klien berbeda dengan versi server terkini (optimistic concurrency conflict).
  - `VALIDATION_ERROR` (400): Alasan pembatalan kosong atau nominal refund melebihi total yang dibayar.
- **Aturan Bisnis & Penegakan Server:**
  - Status `pending`: Pembatalan bebas biaya, payment berstatus `pending` diubah otomatis ke `cancelled`.
  - Status `confirmed` / berbayar: Hanya admin yang berhak membatalkan dengan menetapkan nominal refund (`refundAmount`). Bila refund disetujui, status payment menjadi `refunded`.
  - Slot motor seketika dibebaskan dan kuota promo dikembalikan tepat satu kali.
  - Nilai `version` booking dinaikkan 1 level (`version = version + 1`) dan `cancelled_by` dicatat.
  - Respons menyertakan objek `capabilities` terbaru.

#### 10. `POST /api/admin/bookings/:id/notes`
- **Izin:** `staff` & `admin`
- **Tujuan:** Menambahkan catatan operasional internal ke timeline booking.
- **Parameter Jalur:** `:id` (Dapat berupa ID numerik database atau Kode booking resmi)
- **Request Body:**
```json
{
  "note": "Pelanggan konfirmasi akan mengambil unit sedikit terlambat jam 10:30 WIB"
}
```
- **Kode Error yang Mungkin:**
  - `BOOKING_NOT_FOUND` (404): Booking tidak ditemukan.

#### 11. `POST /api/admin/bookings/:id/deposit-refunded`
- **Izin:** `staff` & `admin`
- **Tujuan:** Menandai bahwa pengembalian sisa uang deposit telah ditransfer/diberikan tunai ke pelanggan. Bersifat idempoten jika sudah ditandai.
- **Parameter Jalur:** `:id` (Dapat berupa ID numerik database atau Kode booking resmi)
- **Kode Error yang Mungkin:**
  - `BOOKING_NOT_FOUND` (404): Booking tidak ditemukan.
  - `INVALID_STATUS_TRANSITION` (409): Booking bukan berstatus `completed`.
- **Aturan Bisnis:** Hanya dapat dipanggil pada booking berstatus `completed`.

#### 12. `GET /api/admin/bookings/export.csv`
- **Izin:** `admin`
- **Tujuan:** Mengunduh seluruh atau irisan data booking terfilter dalam format berkas CSV.

---

### 3.3 Verifikasi Dokumen Identitas

#### 13. `GET /api/admin/documents`
- **Izin:** `staff` & `admin`
- **Parameter Query:** `status` (`pending` | `verified` | `rejected`), `type` (`ktp` | `sim`), `search`, `page`, `limit`
- **Respons (200 OK):** Daftar dokumen dengan informasi penyewa dan tautan preview privat.

#### 14. `GET /api/admin/documents/:userId/:type/file`
- **Izin:** `staff` & `admin`
- **Tujuan:** Mengambil berkas privat foto KTP/SIM pelanggan dengan logging audit otomatis.

#### 15. `POST /api/admin/documents/:userId/:type/verify`
- **Izin:** `staff` & `admin`
- **Request Body:**
```json
{
  "action": "approve", // "approve" | "reject"
  "rejectionReason": "Foto KTP buram dan NIK terpotong", // Wajib jika action === "reject"
  "verifiedData": {
    "fullName": "Budi Santoso",
    "idNumber": "3201987654320002",
    "birthDate": "1995-08-14",
    "simExpiryDate": "2029-08-14"
  }
}
```
- **Aturan Bisnis:**
  - Jika ditolak, `rejectionReason` wajib diisi dan status dokumen menjadi `rejected`.
  - Jika disetujui, usia minimal harus $\ge 18$ tahun dan masa berlaku SIM C harus melewati tanggal selesai booking pelanggan.

---

### 3.4 Manajemen Armada Motor (Motorcycles)

#### 16. `GET /api/admin/motorcycles`
- **Izin:** `staff` (view-only) & `admin` (full access)
- **Parameter Query:** `status` (`available` | `maintenance` | `inactive`), `brand`, `type`, `search`

#### 17. `POST /api/admin/motorcycles`
- **Izin:** `admin` (`staff` $\rightarrow$ `FORBIDDEN_ROLE`)
- **Request Body:**
```json
{
  "name": "Honda PCX 160 ABS",
  "brand": "Honda",
  "type": "matic",
  "cc": 160,
  "year": 2025,
  "color": "Hitam Doff",
  "plate": "DK 8899 XX",
  "transmission": "Otomatis",
  "fuelCapacity": 8.1,
  "pricePerDay": 160000,
  "deposit": 200000,
  "description": "Skutik premium bertenaga besar untuk kenyamanan perjalanan jauh.",
  "features": ["Helm SNI", "Jas Hujan", "Smart Key System", "ABS"],
  "images": ["https://.../pcx1.jpg"],
  "status": "available"
}
```
- **Aturan Bisnis:** Pelat nomor motor harus unik di dalam sistem.

#### 18. `GET /api/admin/motorcycles/:id` & `PUT /api/admin/motorcycles/:id`
- **Izin:** `admin`
- **Aturan Bisnis:** Perubahan harga sewa per hari pada motor hanya berlaku untuk pemesanan mendatang dan tidak mengubah harga booking yang sudah terbentuk sebelumnya.

#### 19. `PATCH /api/admin/motorcycles/:id/status`
- **Izin:** `admin`
- **Request Body:**
```json
{
  "status": "inactive" // "available" | "maintenance" | "inactive"
}
```
- **Kode Error yang Mungkin:**
  - `MOTOR_HAS_BOOKINGS` (409): Motor memiliki pemesanan berstatus `pending`, `confirmed`, atau `active` pada tanggal hari ini ke depan. Sistem mengembalikan daftar kode booking yang menghalangi deaktivasi unit.

#### 20. `POST /api/admin/motorcycles/:id/images`
- **Izin:** `admin`
- **Ketentuan:** Format berkas JPG, PNG, atau WebP, ukuran maksimal 3 MB per berkas, maksimal 8 foto per armada motor.

#### 21. `PUT /api/admin/motorcycles/:id/images/order`
- **Izin:** `admin`
- **Request Body:** `{ "imageUrls": ["url1", "url2", "url3"] }` (Urutan indeks ke-0 menjadi foto sampul utama).

#### 22. `DELETE /api/admin/motorcycles/:id/images/:imageId`
- **Izin:** `admin`

---

### 3.5 Kalender Sewa & Armada

#### 23. `GET /api/admin/calendar?month=YYYY-MM`
- **Izin:** `staff` & `admin`
- **Tujuan:** Mengambil matriks visual 1 bulan penuh: baris motor $\times$ kolom tanggal, memuat blok booking warna-warni dan blok pemeliharaan bengkel.

---

### 3.6 Perawatan & Servis Berkala (Maintenance)

#### 24. `GET /api/admin/maintenance`
- **Izin:** `staff` & `admin`

#### 25. `POST /api/admin/maintenance`
- **Izin:** `staff` & `admin`
- **Request Body:**
```json
{
  "motorId": "1",
  "startDate": "2026-10-28",
  "endDate": "2026-10-30",
  "reason": "Servis CVT dan ganti oli berkala",
  "cost": 150000,
  "technician": "Bengkel AHASS Sunset Road"
}
```
- **Kode Error yang Mungkin:**
  - `MAINTENANCE_CONFLICT` (409): Tanggal servis menabrak booking aktif/mendatang. Sistem menolak dan menyertakan daftar kode booking yang bertabrakan.

#### 26. `PUT /api/admin/maintenance/:id` & `DELETE /api/admin/maintenance/:id`
- **Izin:** `staff` & `admin`

---

### 3.7 Manajemen Pengguna (Users)

#### 27. `GET /api/admin/users` & `GET /api/admin/users/:id`
- **Izin:** `admin` (`staff` $\rightarrow$ `FORBIDDEN_ROLE`)
- **Tujuan:** Melihat daftar pelanggan & staf, riwayat booking pengguna, serta status dokumennya.

#### 28. `PATCH /api/admin/users/:id/active`
- **Izin:** `admin`
- **Request Body:** `{ "isActive": false }`
- **Kode Error yang Mungkin:**
  - `SELF_DEACTIVATION` (400): Admin dilarang menonaktifkan dirinya sendiri.
  - `LAST_ADMIN` (400): Dilarang menonaktifkan akun admin terakhir yang aktif di sistem.

#### 29. `PATCH /api/admin/users/:id/role`
- **Izin:** `admin`
- **Request Body:** `{ "role": "staff" }` // "admin" | "staff" | "customer"
- **Kode Error yang Mungkin:**
  - `SELF_ROLE_CHANGE` (400): Admin dilarang mendegradasi perannya sendiri.
  - `LAST_ADMIN` (400): Operasi ditolak jika menyisakan nol admin utama di sistem.

#### 30. `GET /api/admin/users/:id/renter-profile`
- **Izin:** `staff` & `admin`
- **Tujuan:** Melihat data profil resmi penyewa (`renter_profiles`) termasuk nama sesuai KTP, tanggal lahir, NIK (hanya 4 digit terakhir), alamat domisili/KTP, kontak darurat, serta status kesiapan sewa (`renterReadiness`).
- **Parameter Jalur:** `:id` (ID numerik pengguna)
- **Respons (200 OK):**
```json
{
  "success": true,
  "data": {
    "profile": {
      "userId": 2,
      "fullNameKtp": "Budi Santoso",
      "birthDate": "1995-05-14",
      "nikLast4": "6789",
      "addressKtp": "Jl. Kaliurang KM 5 No. 12, Sleman",
      "phoneE164": "+6281234567891",
      "stayAddress": "Kost Putri Melati, Pogung Baru",
      "emergencyContact": {
        "name": "Hartono Santoso",
        "relation": "orang tua",
        "phone": "+6281298765432"
      },
      "termsVersionAccepted": "2026-v1",
      "gpsConsentAt": "2026-03-01T08:00:00.000Z"
    },
    "readiness": {
      "isReady": true,
      "status": "ready",
      "missingFields": [],
      "pendingDocuments": [],
      "issues": []
    }
  }
}
```

---

### 3.8 Ulasan Pelanggan (Reviews)

#### 30. `GET /api/admin/reviews`
- **Izin:** `admin`
- **Filter:** Rating 1–5 bintang, status tampil/disembunyikan.

#### 31. `PATCH /api/admin/reviews/:id/visibility`
- **Izin:** `admin`
- **Request Body:** `{ "isVisible": false, "hiddenReason": "Mengandung kata-kata kasar / SPAM" }`
- **Aturan Bisnis:** Ulasan yang disembunyikan otomatis dikeluarkan dari perhitungan rata-rata rating publik motor.

---

### 3.9 Master Data Operasional (Promos, Add-ons, Locations)

#### 32. `GET/POST/PUT /api/admin/promos` (+ `PATCH /api/admin/promos/:id/active`)
- **Izin:** `admin`
- **Aturan Bisnis:** Promo yang sudah pernah digunakan pada transaksi sewa tidak boleh dihapus secara permanen (hanya dinonaktifkan / soft-deactivate).

#### 33. `GET/POST/PUT /api/admin/addons` (+ `PATCH /api/admin/addons/:id/active`)
- **Izin:** `admin`
- **Tujuan:** Kelola layanan sewa helm tambahan, jas hujan, boks motor, holder ponsel.

#### 34. `GET/POST/PUT /api/admin/locations` (+ `PATCH /api/admin/locations/:id/active`)
- **Izin:** `admin`
- **Tujuan:** Kelola titik antar jemput resmi (Bandara Ngurah Rai, Kantor Sunset Road, Ubung, dsb) beserta biaya pengantarannya.

---

### 3.10 Pengaturan Sistem (Settings) & Kebijakan Dinamis

Aturan bisnis, kontak, dan pengaturan operasional bersumber tunggal dari tabel `app_settings` di database, dengan cache in-memory 30 detik yang diinvalidasi secara instan saat disimpan atau direset.

> **Prinsip Isolasi Snapshot (`policy_snapshot`):**
> Setiap pemesanan (`bookings`) menyimpan snapshot konfigurasi finansial & hak pelanggan saat dibuat:
> - `minRentalDays`, `maxRentalDays`
> - `bookingExpireMinutes`
> - `lateFeeToleranceMinutes`, `lateFeePercentPerHour`
> - `cancellationThresholdHours`, `cancellationRefundPercent`, `cancellationPolicy`
> - `defaultDeposit`, `minRenterAge`
> Perubahan pengaturan di panel admin di kemudian hari **TIDAK PERNAH** mengubah hak atau kalkulasi denda/refund pemesanan lama yang sudah tercatat.

#### 35. `GET /api/admin/settings`
- **Izin:** `admin` (Role `staff` ditolak 403 Forbidden)
- **Tujuan:** Mengambil konfigurasi global rental motor lengkap dari database.
- **Contoh Respons:**
```json
{
  "success": true,
  "data": {
    "brandName": "RodaKita Rental Motor",
    "whatsappNumber": "081234567890",
    "address": "Jl. Malioboro No. 123, Yogyakarta",
    "contactEmail": "support@rodakita.id",
    "operatingHours": "07.00 - 21.00 WIB",
    "minRentalDays": 1,
    "maxRentalDays": 30,
    "minRenterAge": 17,
    "bookingExpireMinutes": 60,
    "paymentExpiryMinutes": 60,
    "lateFeeToleranceMinutes": 120,
    "lateFeePercentPerHour": 10,
    "defaultDeposit": 200000,
    "cancellationThresholdHours": 24,
    "cancellationRefundPercent": 50,
    "cancellationPolicy": [
      { "thresholdHours": 48, "refundPercent": 100 },
      { "thresholdHours": 24, "refundPercent": 50 },
      { "thresholdHours": 0, "refundPercent": 0 }
    ]
  }
}
```

#### 36. `PUT /api/admin/settings`
- **Izin:** `admin` (Tercatat di `audit_logs` dengan before & after snapshot)
- **Aturan Validasi Server:**
  - `brandName`: string, 1 - 100 karakter.
  - `whatsappNumber`: nomor telepon valid (8 - 20 digit angka, opsional awalan `+`).
  - `contactEmail`: format email valid RFC 5322.
  - `address`: string, maksimal 500 karakter.
  - `operatingHours`: string, 1 - 100 karakter.
  - `minRentalDays`: integer, min 1, tidak boleh melebihi `maxRentalDays`.
  - `maxRentalDays`: integer, maks 90, tidak boleh lebih kecil dari `minRentalDays`.
  - `minRenterAge`: integer, antara 17 s/d 100 tahun.
  - `bookingExpireMinutes` / `paymentExpiryMinutes`: integer, 5 s/d 1440 menit (24 jam).
  - `lateFeeToleranceMinutes`: integer, 0 s/d 240 menit.
  - `lateFeePercentPerHour`: integer, 1 s/d 100 persen.
  - `defaultDeposit`: integer, >= 0.
  - `cancellationPolicy`: array aturan berjenjang `[{ thresholdHours, refundPercent }]`. Harus tersusun menurun masuk akal (ambang jam lebih kecil tidak boleh memberikan refund lebih besar).
- **Request Body:**
```json
{
  "brandName": "RodaKita Rental Motor",
  "whatsappNumber": "081234567890",
  "address": "Jl. Malioboro No. 123, Yogyakarta",
  "contactEmail": "support@rodakita.id",
  "operatingHours": "07.00 - 21.00 WIB",
  "minRentalDays": 1,
  "maxRentalDays": 30,
  "minRenterAge": 17,
  "bookingExpireMinutes": 60,
  "lateFeeToleranceMinutes": 120,
  "lateFeePercentPerHour": 10,
  "defaultDeposit": 200000,
  "cancellationPolicy": [
    { "thresholdHours": 48, "refundPercent": 100 },
    { "thresholdHours": 24, "refundPercent": 50 },
    { "thresholdHours": 0, "refundPercent": 0 }
  ]
}
```

#### 37. `POST /api/admin/settings/reset`
- **Izin:** `admin`
- **Tujuan:** Mengembalikan seluruh konfigurasi sistem ke setelan default awal (fallback), mencatat riwayat ke `audit_logs`, dan menginvalidasi cache.

---

### 3.10.1 Endpoint Publik Terkait Konfigurasi (Meta API)

#### `GET /api/meta/site`
- **Izin:** Publik (Tanpa autentikasi)
- **Tujuan:** Menyediakan metadata situs yang aman dikonsumsi oleh frontend publik (footer, navbar, tombol WhatsApp, kebijakan pembatalan). Seluruh rahasia server (database URL, secret keys, password) terisolasi dan tidak pernah dibocorkan.

#### `GET /api/meta/rental-options`
- **Izin:** Publik (Tanpa autentikasi)
- **Tujuan:** Menyediakan pilihan penjemputan, add-ons, biaya delivery, serta aturan rental (`minDays`, `maxDays`, `lateFeeToleranceMinutes`, `lateFeePercentPerHour`, `minRenterAge`, `cancellationPolicy`) yang diambil dinamis dari database.

---

### 3.11 Pesan Kontak (Contact Messages)

#### 38. `GET /api/admin/contact-messages`
- **Izin:** `staff` & `admin`
- **Tujuan:** Daftar pertanyaan dari formulir hubungi kami website publik.

#### 39. `PATCH /api/admin/contact-messages/:id/read`
- **Izin:** `staff` & `admin`
- **Tujuan:** Menandai pesan telah dibaca/ditindaklanjuti oleh staf.

---

### 3.12 Laporan & Analitik Keuangan

#### 40. `GET /api/admin/reports/revenue` (Mendukung `?format=csv`)
- **Izin:** `admin` (`staff` $\rightarrow$ `FORBIDDEN_ROLE`)
- **Parameter Query:** `startDate`, `endDate`, `groupBy` (`daily` | `weekly` | `monthly`), `format`
- **Definisi Resmi Pendapatan RodaKita:**
  $$\text{Pendapatan Bersih} = \sum (\text{Harga Sewa Unit Berstatus Confirmed, Active, Completed}) - \sum \text{Refund Pembatalan} + \sum \text{Denda Telat} + \sum \text{Biaya Kerusakan} + \sum \text{Biaya Lain}$$
  *Catatan: Uang deposit jaminan BUKAN merupakan komponen pendapatan.*

#### 41. `GET /api/admin/reports/utilization` (Mendukung `?format=csv`)
- **Izin:** `admin`
- **Tujuan:** Laporan tingkat okupansi armada motor (persentase hari motor terpakai vs total hari dalam periode).

#### 42. `GET /api/admin/reports/top-motors` (Mendukung `?format=csv`)
- **Izin:** `admin`
- **Tujuan:** Peringkat 5 armada motor dengan frekuensi sewa tertinggi dan kontribusi pendapatan terbesar.

#### 43. `GET /api/admin/reports/bookings-summary` (Mendukung `?format=csv`)
- **Izin:** `admin`
- **Tujuan:** Rekapitulasi distribusi status pemesanan (menunggu, lunas, aktif, selesai, batal).

---

### 3.13 Log Audit (Audit Logs)

#### 44. `GET /api/admin/audit-logs`
- **Izin:** `admin` (`staff` $\rightarrow$ `FORBIDDEN_ROLE`)
- **Parameter Query:** `search`, `action`, `actorName`, `date`, `page`, `limit`
- **Tujuan:** Rekaman jejak forensik seluruh aktivitas administratif (siapa yang mengubah data, aksi apa yang dilakukan, objek apa, kapan waktu WIB-nya, dan rincian perubahannya).
- **Respons (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "aud-1729576800000",
      "action": "CONFIRM_PAYMENT",
      "module": "Booking",
      "details": "Konfirmasi pembayaran manual booking #RK-2610-001 sejumlah Rp 350.000",
      "actorName": "Ahmad Fauzi",
      "actorRole": "staff",
      "targetId": "b-101",
      "timestamp": "2026-10-22T09:00:00+07:00"
    }
  ]
}
```

---

### 3.14 Manajemen Konten Dinamis & Halaman (Tahap 2)

Modul ini mengelola halaman statis/kebijakan (Terms, Privacy, About, How-it-Works), FAQ interaktif, dan Content Blocks dinamis (Hero title/subtitle, CTA text, Announcement Banner) dengan rendering Markdown, sanitasi XSS berlapis, versioning halaman, serta snapshot versi Terms pada booking.

#### A. Endpoint Publik Konten (`/api/content/*`)
1. **`GET /api/content/pages/:slug`**
   - **Izin:** Publik
   - **Slug:** `terms`, `privacy`, `about`, `how-it-works`
   - **Tujuan:** Mengambil halaman publik yang aktif (`is_published: true`). Jika belum ada di database, sistem mengembalikan konten fallback default netral tanpa error (zero-downtime).
   - **Respons (200 OK):**
   ```json
   {
     "success": true,
     "data": {
       "slug": "terms",
       "title": "Syarat dan Ketentuan Sewa",
       "version": 2,
       "html": "<h2>1. Persyaratan Penyewa</h2><p>Penyewa wajib memiliki KTP...</p>",
       "updatedAt": "2026-10-23T15:30:00.000Z"
     }
   }
   ```

2. **`GET /api/content/faqs`**
   - **Izin:** Publik
   - **Tujuan:** Mengambil daftar FAQ yang berstatus aktif (`is_active: true`), diurutkan berdasarkan `display_order` ASC. Jawaban dirender ke HTML aman.
   - **Respons (200 OK):**
   ```json
   {
     "success": true,
     "data": [
       {
         "id": "faq_abc123",
         "category": "Persyaratan",
         "question": "Apa saja syarat sewa motor di RodaKita?",
         "answerHtml": "<p>Cukup sediakan e-KTP asli dan SIM C aktif...</p>",
         "displayOrder": 10
       }
     ]
   }
   ```

3. **`GET /api/content/blocks`**
   - **Izin:** Publik
   - **Tujuan:** Mengambil content blocks publik (Hero Title, Hero Subtitle, CTA text, dan Announcement Banner dengan pengecekan jendela waktu aktif `starts_at` & `ends_at`).
   - **Respons (200 OK):**
   ```json
   {
     "success": true,
     "data": {
       "heroTitle": "Sewa Motor Cepat, Aman, dan Terpercaya di Jogja",
       "heroSubtitle": "Nikmati liburan bebas macet dengan armada motor matic & trail terawat.",
       "ctaText": "Pilih Motor Sekarang",
       "announcement": {
         "enabled": true,
         "message": "Promo Weekend: Diskon 15% semua motor matic! Kode: WEEKENDSERU",
         "linkUrl": "/promos",
         "linkLabel": "Lihat Promo",
         "startsAt": "2026-10-20T00:00:00Z",
         "endsAt": "2026-10-31T23:59:59Z"
       }
     }
   }
   ```

#### B. Endpoint Admin Konten Halaman (`/api/admin/pages/*`)
4. **`GET /api/admin/pages`**
   - **Izin:** `admin`
   - **Tujuan:** Daftar ringkas seluruh master halaman beserta versi aktif dan status publikasi.

5. **`GET /api/admin/pages/:slug`**
   - **Izin:** `admin`
   - **Tujuan:** Mengambil detail halaman beserta konten mentah Markdown (`body_markdown`), versi saat ini, riwayat versi, dan status publikasi.

6. **`PUT /api/admin/pages/:slug`**
   - **Izin:** `admin`
   - **Body:** `{ "title": "...", "body": "## Markdown baru...", "changeSummary": "Pembaruan klausul asuransi" }`
   - **Tujuan:** Memperbarui konten halaman. Secara otomatis menaikkan nomor versi (`version = version + 1`), mengarsipkan versi lama ke `page_versions`, merender Markdown ke HTML tersanitasi, dan mencatat log audit `UPDATE_PAGE`.

7. **`PATCH /api/admin/pages/:slug/publish`**
   - **Izin:** `admin`
   - **Body:** `{ "isPublished": true | false }`
   - **Tujuan:** Mengaktifkan atau menonaktifkan visibilitas halaman di situs publik.

8. **`GET /api/admin/pages/:slug/versions`**
   - **Izin:** `admin`
   - **Tujuan:** Mengambil daftar riwayat versi halaman beserta catatan ringkasan perubahan (`change_summary`) dan aktor pembuat.

9. **`POST /api/admin/pages/:slug/restore/:version`**
   - **Izin:** `admin`
   - **Tujuan:** Mengembalikan (*rollback*) konten halaman ke versi historis tertentu. Aksi ini membuat versi baru dengan catatan `Restored from version X`.

10. **`POST /api/admin/pages/preview`**
    - **Izin:** `admin`
    - **Body:** `{ "markdown": "## Preview heading..." }`
    - **Tujuan:** Merender pratinjau instan Markdown ke HTML tersanitasi tanpa menyimpan ke database.

#### C. Endpoint Admin FAQ (`/api/admin/faqs/*`)
11. **`GET /api/admin/faqs`**
    - **Izin:** `admin`
    - **Tujuan:** Mengambil semua item FAQ (termasuk yang non-aktif) untuk manajemen admin.

12. **`POST /api/admin/faqs`**
    - **Izin:** `admin`
    - **Body:** `{ "category": "Umum", "question": "...", "answer": "Markdown answer...", "displayOrder": 10, "isActive": true }`

13. **`PUT /api/admin/faqs/:id`**
    - **Izin:** `admin`
    - **Body:** Bidang yang diperbarui (`category`, `question`, `answer`, `displayOrder`, `isActive`).

14. **`DELETE /api/admin/faqs/:id`**
    - **Izin:** `admin`
    - **Tujuan:** Menghapus FAQ secara permanen.

15. **`PATCH /api/admin/faqs/reorder`**
    - **Izin:** `admin`
    - **Body:** `{ "orders": [{ "id": "faq_1", "displayOrder": 1 }, { "id": "faq_2", "displayOrder": 2 }] }`
    - **Tujuan:** Mengatur ulang urutan tampil FAQ secara massal.

#### D. Endpoint Admin Content Blocks (`/api/admin/content-blocks/*`)
16. **`GET /api/admin/content-blocks`**
    - **Izin:** `admin`
    - **Tujuan:** Mengambil semua blok konten beserta nilai mentahnya.

17. **`PUT /api/admin/content-blocks/:key`**
    - **Izin:** `admin`
    - **Key yang didukung:** `hero_title`, `hero_subtitle`, `cta_text`, `announcement_banner`
    - **Body:** `{ "value": "..." }` atau `{ "value": { "enabled": true, "message": "...", "linkUrl": "...", "startsAt": "...", "endsAt": "..." } }`

#### E. Snapshot Versi Terms pada Booking
- Saat pengguna membuat reservasi (`POST /api/bookings`), payload dapat menyertakan `acceptedTermsVersion: number`.
- Jika dikosongkan, backend secara otomatis mengisi versi aktif Terms saat ini via `resolveTermsVersion()`.
- Kolom `terms_version` disimpan pada tabel `bookings` sebagai snapshot permanen (*immutable legal audit trail*) yang membuktikan versi syarat sewa mana yang disetujui penyewa pada saat transaksi dibuat.

#### F. Standar Keamanan & Sanitasi Konten
- **XSS Sanitization Backend:** Menggunakan `marked` dan `sanitize-html` dengan aturan ketat:
  - Tag yang dibuang beserta teksnya (`nonTextTags`): `<script>`, `<style>`.
  - Protokol URL yang diizinkan: `http`, `https`, `mailto`, `tel`.
  - Semua link eksternal otomatis ditambahkan atribut `rel="noopener noreferrer nofollow"`.
- **Sanitasi Frontend:** Komponen `<SafeHtml />` membungkus `DOMPurify.sanitize()` untuk perlindungan lapisan ganda (*defense-in-depth*).
- **Variabel Placeholder Dinamis:** Teks Markdown mendukung variabel yang di-escape secara aman:
  - `{{brandName}}`, `{{brandPhone}}`, `{{brandEmail}}`, `{{brandAddress}}`.

---

### 3.15 Aturan Harga Dinamis & Tier Diskon Durasi (Tahap 3)

Modul ini memberikan kendali penuh kepada Administrator untuk mengonfigurasi lonjakan harga (*surge pricing*) akhir pekan, musim liburan (*seasonal/holiday*), aturan harga kustom, dan tier diskon otomatis berbasis durasi sewa langsung dari database dengan jaminan performa tinggi (caching 30 detik) serta audit trail forensik lengkap.

#### A. Endpoint Aturan Harga (Pricing Rules)

1. **`GET /api/admin/pricing-rules`**
   - **Izin:** `admin` (Staff & Customer mendapat `403 FORBIDDEN_ROLE`)
   - **Deskripsi:** Mengembalikan seluruh daftar aturan harga dinamis yang terdaftar di basis data, diurutkan berdasarkan prioritas menurun.
   - **Respons (200):**
     ```json
     {
       "success": true,
       "data": [
         {
           "id": 1,
           "name": "Weekend Surcharge Standar",
           "ruleType": "weekend",
           "rateType": "percentage",
           "rateValue": 10,
           "startDate": null,
           "endDate": null,
           "scope": "all",
           "scopeValue": null,
           "priority": 1,
           "isActive": true,
           "createdAt": "2026-10-24T00:00:00.000Z",
           "updatedAt": "2026-10-24T00:00:00.000Z"
         }
       ]
     }
     ```

2. **`POST /api/admin/pricing-rules`**
   - **Izin:** `admin`
   - **Payload:**
     ```json
     {
       "name": "Peak Season Libur Akhir Tahun",
       "ruleType": "seasonal",
       "rateType": "fixed",
       "rateValue": 50000,
       "startDate": "2026-12-20",
       "endDate": "2027-01-05",
       "scope": "all",
       "scopeValue": null,
       "priority": 10,
       "isActive": true
     }
     ```
   - **Validasi:**
     - `name`: string wajib (min 3 karakter).
     - `ruleType`: `weekend` | `seasonal` | `holiday` | `custom`.
     - `rateType`: `multiplier` | `fixed` | `percentage`.
     - `rateValue`: angka positif > 0.
     - `startDate` & `endDate`: format `YYYY-MM-DD` (opsional untuk weekend, wajib jika ada rentang waktu).
     - `scope`: `all` | `motor_type` | `motorcycle`.
   - **Respons (201):** Objek aturan harga yang baru dibuat. Menginvaliasi cache harga backend dan mencatat audit log.

3. **`PUT /api/admin/pricing-rules/:id`**
   - **Izin:** `admin`
   - **Payload:** Parsial (patch) atribut aturan harga (`name`, `rateValue`, `isActive`, dll).
   - **Respons (200):** Objek aturan harga terperbarui. Menginvaliasi cache harga backend dan mencatat audit log.

4. **`DELETE /api/admin/pricing-rules/:id`**
   - **Izin:** `admin`
   - **Respons (200):** `{ "success": true, "data": { "id": 1 } }`.

#### B. Endpoint Tier Diskon Durasi Sewa (Discount Tiers)

5. **`GET /api/admin/discount-tiers`**
   - **Izin:** `admin`
   - **Deskripsi:** Mengembalikan daftar tier diskon durasi sewa aktif & nonaktif, diurutkan ascending berdasarkan `minDays`.
   - **Respons (200):**
     ```json
     {
       "success": true,
       "data": [
         {
           "id": 1,
           "minDays": 3,
           "discountPercent": 5,
           "description": "Diskon sewa 3 hari atau lebih",
           "isActive": true
         },
         {
           "id": 2,
           "minDays": 7,
           "discountPercent": 10,
           "description": "Diskon sewa mingguan",
           "isActive": true
         }
       ]
     }
     ```

6. **`POST /api/admin/discount-tiers`**
   - **Izin:** `admin`
   - **Payload:**
     ```json
     {
       "minDays": 30,
       "discountPercent": 20,
       "description": "Diskon sewa bulanan hemat",
       "isActive": true
     }
     ```
   - **Validasi:** `minDays >= 1`, `discountPercent` di antara 1 dan 100.
   - **Respons (201):** Objek tier diskon yang baru dibuat.

7. **`PUT /api/admin/discount-tiers/:id`**
   - **Izin:** `admin`
   - **Payload:** Parsial data tier (`discountPercent`, `isActive`, `description`, dll).
   - **Respons (200):** Objek tier diskon terperbarui.

8. **`DELETE /api/admin/discount-tiers/:id`**
   - **Izin:** `admin`
   - **Respons (200):** `{ "success": true, "data": { "id": 1 } }`.

#### C. Immutability & Snapshotting Booking (Jaminan Hukum Transaksi)
- Setiap kali booking dibuat (`POST /api/bookings`) atau rincian biaya dihitung (`POST /api/bookings/quote`), mesin harga mengevaluasi aturan aktif dan membungkus hasil lengkap ke dalam objek `pricing_snapshot` (disimpan pada kolom JSONB `bookings.pricing_snapshot`).
- **Jaminan Imutabilitas:** Jika Administrator di masa depan mengubah, menaikkan tarif, menonaktifkan, atau menghapus aturan harga dan tier diskon, data transaksi sewa yang telah dibuat **TIDAK AKAN PERNAH BERUBAH** (`grandTotal`, `subtotal`, rincian biaya tetap identik dengan kondisi saat transaksi disepakati).

---

### 3.14 Modul Pelacakan GPS Armada (GPS Tracking & Telemetry)

Base Route: `/api/admin/gps`  
Audit Trail: Seluruh akses lokasi atau riwayat rute otomatis mencatat log ke tabel `gps_access_log`.

1. **`GET /api/admin/gps/live`**
   - **Izin:** `staff`, `admin`
   - **Tujuan:** Mengambil posisi live seluruh perangkat GPS aktif, status online/offline, data sewa berjalan, dan alert terbuka.
   - **Catatan Audit:** Menulis `lihat_live` pada `gps_access_log`.
   - **Respons (200):**
     ```json
     {
       "success": true,
       "data": {
         "devices": [
           {
             "id": 1,
             "motorcycleId": 1,
             "motorcycleName": "Honda Beat",
             "plateNumber": "DK 1234 ***",
             "isOnline": true,
             "lastLat": -8.670452,
             "lastLng": 115.212674,
             "speedKmh": 36.3,
             "batteryPct": 95,
             "ignition": true,
             "activeBooking": {
               "bookingCode": "RM-261029-A1B2",
               "customerName": "Budi Santoso",
               "customerPhone": "081234567890",
               "scheduledReturn": "2026-10-31T21:00:00"
             },
             "openAlertsCount": 0
           }
         ],
         "geofences": [ ... ],
         "total": 14,
         "onlineCount": 12,
         "offlineCount": 2,
         "alertsCount": 0
       }
     }
     ```

2. **`GET /api/admin/gps/motorcycles/:id/positions?from=ISO&to=ISO`**
   - **Izin:** `staff` (dibatasi `gps.history_max_days_staff` maks 7 hari), `admin` (sampai retensi 90 hari).
   - **Tujuan:** Mengambil riwayat jejak rute motor. Otomatis disederhanakan via RDP jika > 500 titik dan dilengkapi titik perhentian (`stops` diam > 5 menit).
   - **Catatan Audit:** Menulis `lihat_riwayat` pada `gps_access_log`.

3. **`GET /api/admin/gps/alerts`**
   - **Izin:** `staff`, `admin`
   - **Query Params:** `status`, `severity`, `type`, `motorcycleId`, `isOpenOnly`, `page`, `limit`
   - **Respons (200):** Daftar alert telemetri GPS terfilter.

4. **`PATCH /api/admin/gps/alerts/:id/acknowledge`**
   - **Izin:** `staff`, `admin`
   - **Tujuan:** Petugas mengakui (acknowledge) alarm peringatan.

5. **`PATCH /api/admin/gps/alerts/:id/resolve`**
   - **Izin:** `staff`, `admin`
   - **Body:** `{ "note": "Catatan penyelesaian wajib" }`
   - **Aturan:** Menolak jika `note` kosong.

6. **`GET /api/admin/gps/devices` & `POST /api/admin/gps/devices`**
   - **Izin:** `admin` (Khusus Admin)
   - **Tujuan:** Pendaftaran perangkat tracker ke unit motor (1 perangkat per motor).

7. **`PUT /api/admin/gps/devices/:id` & `POST /api/admin/gps/devices/:id/replace`**
   - **Izin:** `admin` (Khusus Admin)
   - **Tujuan:** Update status perangkat atau ganti unit GPS baru tanpa kehilangan riwayat rute motor.

8. **`CRUD /api/admin/gps/geofences`**
   - **Izin:** `admin` (Khusus Admin)
   - **Tujuan:** Pengelolaan area batas wilayah (`allowed`, `garage`, `forbidden`) dengan bentuk lingkaran (`circle`) atau poligon (`polygon`).

9. **`GET /api/admin/gps/settings` & `PUT /api/admin/gps/settings`**
   - **Izin:** `admin` (Khusus Admin)
   - **Tujuan:** Konfigurasi ambang batas offline, kecepatan, baterai rendah, radius markas, dan retensi data.

10. **`GET /api/admin/gps/access-log`**
    - **Izin:** `admin` (Khusus Admin)
    - **Tujuan:** Audit trail forensik terhadap seluruh aktivitas pemantauan live dan riwayat rute.

---

## 4. Ringkasan Matriks Izin (Permission Matrix)

| Modul / Fitur | Staf Operasional (`staff`) | Administrator (`admin`) |
| :--- | :---: | :---: |
| **Dashboard KPI & Tugas Hari Ini** | ✔ Akses Penuh | ✔ Akses Penuh |
| **Transaksi Booking (Lihat, Konfirmasi Bayar, Serah Terima, Kembali, Catatan)** | ✔ Akses Penuh | ✔ Akses Penuh |
| **Pelacakan GPS Live & Riwayat Rute (Maks 7 Hari)** | ✔ Akses Penuh | ✔ Akses Penuh (Maks 90 Hari) |
| **Acknowledge & Selesaikan Peringatan GPS (Alerts)** | ✔ Akses Penuh | ✔ Akses Penuh |
| **Pendaftaran & Penggantian Perangkat GPS** | ❌ Dibatasi | ✔ Akses Penuh |
| **Kelola Area Geofence & Pengaturan GPS** | ❌ Dibatasi | ✔ Akses Penuh |
| **Log Akses Pelacakan Lokasi (gps_access_log)** | ❌ Dibatasi | ✔ Akses Penuh |
| **Pembatalan Booking & Refund Uang** | ❌ Dibatasi | ✔ Akses Penuh |
| **Ekspor CSV Booking & Laporan** | ❌ Dibatasi | ✔ Akses Penuh |
| **Verifikasi Dokumen Identitas (KTP & SIM C)** | ✔ Akses Penuh | ✔ Akses Penuh |
| **Kalender Sewa & Matriks Ketersediaan** | ✔ Akses Penuh | ✔ Akses Penuh |
| **Perawatan & Servis Motor (Maintenance)** | ✔ Akses Penuh | ✔ Akses Penuh |
| **Pesan Kontak Pelanggan** | ✔ Akses Penuh | ✔ Akses Penuh |
| **Master Armada Motor (Tambah/Ubah/Hapus/Foto)** | ❌ Baca Saja | ✔ Akses Penuh |
| **Manajemen Pengguna & Penetapan Peran (Role)** | ❌ Dibatasi | ✔ Akses Penuh |
| **Moderasi Ulasan Pelanggan** | ❌ Dibatasi | ✔ Akses Penuh |
| **Master Promo, Add-ons, dan Lokasi** | ❌ Dibatasi | ✔ Akses Penuh |
| **Aturan Harga Dinamis & Tier Diskon Durasi** | ❌ Dibatasi | ✔ Akses Penuh |
| **Manajemen Konten Dinamis, Halaman, FAQ & Banner** | ❌ Dibatasi | ✔ Akses Penuh |
| **Laporan & Analitik Keuangan** | ❌ Dibatasi | ✔ Akses Penuh |
| **Audit Log Jejak Forensik** | ❌ Dibatasi | ✔ Akses Penuh |
| **Pengaturan Sistem Global** | ❌ Dibatasi | ✔ Akses Penuh |

---
*Dokumen ini merupakan kontrak resmi implementasi arsitektur REST API Panel Admin RodaKita.*


