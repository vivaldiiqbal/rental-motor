# Panduan Arsitektur & Operasional Pelacakan GPS — RodaKita

Dokumen ini merupakan panduan teknis resmi implementasi sistem pelacakan GPS, telemetri armada, dan mesin peringatan otomatis pada platform RodaKita (React, Node.js/Express, PostgreSQL).

---

## 1. Arsitektur Sistem & Alur Data

Sistem pelacakan GPS RodaKita dirancang dengan pola **Provider Adapter Pattern** dan **Event-Driven Architecture**:

```
+---------------------------------------------------------------------------------+
|                               SUMBER SINYAL GPS                                 |
|  [GPS Simulator]          [Traccar GPS Server]          [Generic GPS Webhook]   |
|   (Development)         (Protokol OsmAnd/Traccar)        (Vendor Pelacak Lain)  |
+---------------------------------------------------------------------------------+
                                       |
                                       v
               POST /api/gps/ingest/:provider (HMAC Auth & Rate Limit)
                                       |
                                       v
                 +-------------------------------------------+
                 |            GpsIngestService               |
                 | - Validasi format, waktu (-7d..+2m), bbox |
                 | - Konversi via BaseGpsProvider Adapter    |
                 | - Idempotensi (UNIQUE device, timestamp)  |
                 | - Update snapshot posisi gps_devices      |
                 +-------------------------------------------+
                                       |
                 +---------------------+---------------------+
                 |                                           |
                 v                                           v
     +-----------------------+                   +-----------------------+
     |   gpsAlertService     |                   |   eventBroadcaster    |
     | - Evaluasi geofence   |                   | - Throttled 3s / unit |
     | - Keluar/masuk area   |                   | - Event: gps.position |
     | - Kecepatan (3x)      |                   | - Event: gps.alert    |
     | - Theft/Unauth move   |                   | - SSE Admin/Staff     |
     | - Daya & Baterai      |                   +-----------------------+
     +-----------------------+                               |
                 |                                           v
                 v                                 +-------------------+
     +-----------------------+                     | Admin & Staff UI  |
     | PostgreSQL Data Store |                     | - Leaflet Map     |
     | - gps_devices         |                     | - Detail Telemetri|
     | - gps_positions       |                     | - Route Playback  |
     | - geofences           |                     +-------------------+
     | - gps_alerts          |
     | - gps_access_log      |
     +-----------------------+
```

### Komponen Utama:
1. **Penerimaan Terpadu (`POST /api/gps/ingest/:provider`)**:
   - Memvalidasi stempel waktu, koordinat, kecepatan, dan tanda tangan keamanan.
   - Mengembalikan respons cepat `202 Accepted` tanpa membebani perangkat GPS berdaya rendah.
   - Pemrosesan asinkron internal untuk penyimpanan, evaluasi peringatan, dan penyiaran SSE.
2. **Abstraksi Multi-Provider (`GpsProvider`)**:
   - Antarmuka generik yang memetakan format data mentah dari berbagai protokol hardware menjadi entitas standar `NormalizedPosition`.
   - Implementasi yang tersedia: `SimulatorGpsProvider`, `TraccarGpsProvider`, dan `GenericWebhookGpsProvider`.
3. **Mesin Evaluasi Peringatan (`gpsAlertService`)**:
   - Menganalisis pelanggaran area batas (geofence), ambang batas kecepatan, kondisi mesin, status baterai, dan pemutusan sambungan kabel aki.
   - Dilengkapi margin toleransi histeresis (30 m) dan penyaring derau (*noise suppression*) untuk motor yang sedang parkir diam.
4. **Isolasi Privasi & Audit Log Forensik (`gps_access_log`)**:
   - Pelanggan **TIDAK PERNAH** menerima koordinat lokasi melalui jalur API publik, SSE, maupun respons transaksi.
   - Sisi penyewa hanya menampilkan pemberitahuan transparansi hukum pada checkout dan Syarat Sewa bahwa motor dipasangi GPS.
   - Setiap kali Admin atau Staff membuka pemantauan langsung atau riwayat rute motor, sistem secara otomatis mencatat ID petugas, jenis tindakan, ID motor, dan alamat IP ke dalam `gps_access_log`.

---

## 2. Cara Menjalankan Simulator GPS

Simulator bawaan (`backend/scripts/simulateGps.js`) digunakan untuk memvalidasi telemetri tanpa perangkat keras fisik:

### 2.1 Perintah Provisioning Perangkat Simulator
Untuk mendaftarkan unit tracker simulator secara otomatis ke seluruh motor armada yang belum memiliki tracker:
```bash
npm run gps:simulate -- --provision
```

### 2.2 Menjalankan Simulasi Pergerakan Motor
Menjalankan simulasi pergerakan motor di sekitar koordinat markas operasional:
```bash
# Menjalankan simulasi standar
npm run gps:simulate

# Menjalankan dengan interval kirim tertentu (misal tiap 3 detik)
npm run gps:simulate -- --interval 3

# Menjalankan dengan seed acak tetap untuk reprodusibilitas pengujian
npm run gps:simulate -- --seed 42
```

### 2.3 Skenario Perilaku yang Disimulasikan:
1. **Perjalanan Normal (`normal_trip`)**: Bergerak stabil dalam batas kecepatan (30–60 km/jam) di dalam koridor area yang diizinkan.
2. **Keluar Area Operasional (`out_of_bounds`)**: Melintasi batas geofence yang diizinkan untuk menguji alarm `keluar_area`.
3. **Kehilangan Sinyal & Data Tertunda (`signal_loss_buffered`)**: Menyimpan paket lokasi saat sinyal putus, lalu memancarkan sekumpulan data historis tertunda saat tersambung kembali.
4. **Penurunan Baterai Cadangan (`battery_drain`)**: Baterai menurun bertahap hingga menyentuh ambang `< 20%` untuk memicu alarm `baterai_rendah`.
5. **Pemutusan Sambungan Aki (`power_disconnected`)**: Status `power_connected` berubah dari `true` menjadi `false` untuk menguji alarm darurat `daya_terputus` (*tamper alarm*).
6. **Pergerakan Liar Tanpa Sewa (`unauthorized_movement`)**: Motor berpindah posisi lebih dari ambang radius markas (`gps.unauthorized_move_meters`) atau mesin menyala tanpa adanya booking berstatus `active` (indikasi pencurian).
7. **Melaju Melebihi Batas (`speeding`)**: Memacu kecepatan melebihi `gps.speed_limit_kmh` selama 3 sampel berturut-turut untuk memverifikasi alarm `kecepatan`.
8. **Keterlambatan Pengembalian (`overdue_return`)**: Waktu pemesanan aktif melewati jam kembali ditambah toleransi `gps.overdue_grace_minutes`.

> **Pengaman Lingkungan Produksi:**  
> Skrip simulator memiliki proteksi bawaan: jika dijalankan pada `NODE_ENV=production`, simulator **segera menolak berjalan** guna mencegah kontaminasi data palsu pada armada nyata.

---

## 3. Integrasi Traccar & Pemasangan Alat Pelacak Nyata

RodaKita mendukung koneksi ke server Traccar (open-source GPS tracking system terpopuler) maupun perangkat yang mengirimkan webhook langsung.

### 3.1 Daftar Periksa Pemasangan Hardware (Physical Tracker Checklist)
Sebelum unit motor diserahkan ke operasional, teknisi wajib melakukan langkah verifikasi fisik berikut:

- [ ] **1. Lokasi Pemasangan Fisik**: Pasang modul GPS di bawah cover bodi motor yang terlindung dari air/panas dan tidak terhalang oleh rangka besi tebal (posisi antena GPS menghadap ke atas/langit).
- [ ] **2. Sambungan Sumber Daya Utama**: Hubungkan kabel positif (+) dan negatif (-) ke aki motor. Pastikan sekring (fuse 2A–5A) terpasang di jalur positif aki.
- [ ] **3. Deteksi Kontak Kunci (ACC/Ignition)**: Sambungkan kabel input ACC ke jalur kabel stop kontak motor agar status mesin menyala (`ignition: true`) dan mati (`ignition: false`) terbaca akurat.
- [ ] **4. Uji Baterai Cadangan Internal**: Putuskan sekring utama motor selama 2 menit. Pastikan perangkat tetap memancarkan data menggunakan baterai internalnya dan mengirimkan flag `power_connected: false`.
- [ ] **5. Registrasi IMEI di Panel Admin**:
  1. Buka menu **Pelacakan GPS > Perangkat**.
  2. Klik tombol **Pasang Tracker Baru**.
  3. Masukkan ID Motor, pilih Provider (`traccar` atau `webhook`), masukkan nomor IMEI/External ID yang tertera pada stiker perangkat, dan beri label.
- [ ] **6. Verifikasi Sinyal Perdana**: Pastikan indikator status perangkat di panel admin berubah menjadi **Online (Terhubung)** dan koordinat motor terpetakan tepat di markas operasional.

### 3.2 Menghubungkan Server Traccar ke RodaKita
Jika Anda menggunakan server Traccar terpusat, gunakan fitur *Position Forwarding* Traccar:

1. Buka berkas konfigurasi `traccar.xml` pada server Traccar Anda.
2. Tambahkan baris konfigurasi penerusan posisi ke endpoint RodaKita:
```xml
<entry key='forward.enable'>true</entry>
<entry key='forward.url'>https://api.rodakita.id/api/gps/ingest/traccar</entry>
<entry key='forward.header'>x-gps-secret: rodakita_gps_secret_shared_key_2026</entry>
```
3. Restart Traccar (`sudo systemctl restart traccar`).
4. Setiap posisi baru yang diterima server Traccar dari alat nyata (Coban, Concox, Teltonika, Sinotrack, dll.) akan otomatis diteruskan ke RodaKita secara realtime.

---

## 4. Spesifikasi Format Payload & Asumsi

### 4.1 Endpoint Standar Ingest
- **Metode**: `POST`
- **URL**: `/api/gps/ingest/:provider` (contoh: `/api/gps/ingest/traccar`, `/api/gps/ingest/simulator`, `/api/gps/ingest/webhook`)
- **Headers Wajib**:
  - `Content-Type: application/json`
  - `x-gps-secret: <SECRET_KEY>` atau `x-gps-signature: <HMAC_SHA256>` bersama `x-gps-timestamp: <ISO_OR_EPOCH_MS>`

### 4.2 Payload Format Generic (Simulator & Webhook)
```json
{
  "externalId": "865432049182371",
  "lat": -8.670458,
  "lng": 115.212629,
  "speedKmh": 42.5,
  "heading": 180,
  "accuracyM": 5.2,
  "ignition": true,
  "batteryPct": 85,
  "powerConnected": true,
  "satellites": 12,
  "recordedAt": "2026-10-29T10:15:30.000Z"
}
```

### 4.3 Format Payload Penerusan Traccar (Traccar Forwarding Format)
Traccar mengirimkan struktur posisi standar dengan atribut tersarang:
```json
{
  "device": {
    "uniqueId": "865432049182371",
    "name": "Vario 160 DK 1234 ABC"
  },
  "position": {
    "latitude": -8.670458,
    "longitude": 115.212629,
    "speed": 22.95,
    "course": 180,
    "accuracy": 5.0,
    "deviceTime": "2026-10-29T10:15:30.000Z",
    "attributes": {
      "ignition": true,
      "batteryLevel": 85,
      "charge": true,
      "sat": 12
    }
  }
}
```
*Catatan Konversi:* Kecepatan dari Traccar secara default dalam satuan *knots*. Adapter `TraccarGpsProvider` mengonversinya secara otomatis ke km/jam (`speed * 1.852`).

---

## 5. Variabel Lingkungan (Environment Variables)

Tambahkan variabel berikut pada berkas `.env` server backend dan frontend:

### Backend (`backend/.env`):
| Variabel | Default / Contoh | Deskripsi |
| :--- | :--- | :--- |
| `GPS_INGEST_SECRET` | `rodakita_gps_secret_shared_key_2026` | Kunci rahasia global untuk autentikasi ingest |
| `GPS_SIMULATOR_SECRET` | `dev_sim_secret_key_123` | Rahasia khusus adaptor simulator |
| `GPS_TRACCAR_SECRET` | `rodakita_traccar_secret_key` | Rahasia verifikasi webhook penerusan Traccar |
| `GPS_WEBHOOK_SECRET` | `rodakita_webhook_vendor_secret` | Rahasia verifikasi vendor pelacak pihak ketiga |
| `GPS_RETENTION_DAYS` | `90` | Batas retensi posisi sebelum dibersihkan otomatis |

### Frontend (`.env`):
| Variabel | Default / Contoh | Deskripsi |
| :--- | :--- | :--- |
| `VITE_MAP_TILE_URL` | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | URL ubin peta Leaflet (OpenStreetMap / Mapbox) |
| `VITE_MAP_ATTRIBUTION` | `&copy; OpenStreetMap contributors` | Atribusi hak cipta ubin peta |

> **Catatan Ubin Peta OpenStreetMap (OSM):**  
> Ubin publik `tile.openstreetmap.org` hanya ditujukan untuk pengujian dan pengembangan ringan. Untuk lingkungan produksi berskala besar, gunakan penyedia ubin komersial (seperti Mapbox, Stadia Maps, atau server ubin mandiri) sesuai kebijakan penggunaan OSM (*Tile Usage Policy*).

---

## 6. Privasi, Keamanan, & Retensi Data

1. **Prinsip *Zero Customer Exposure*:**
   - Database dan API tidak pernah mengekspos posisi koordinat kepada penyewa.
   - Channel Server-Sent Events (SSE) memfilter event `gps.*` di level server (`canUserReceiveEvent`), sehingga klien customer tidak pernah menerima data telemetri.
2. **Pembersihan Retensi Otomatis (`gpsJobs.js`):**
   - Menjalankan pekerjaan pembersih berkala (cron) setiap malam.
   - Posisi GPS yang lebih tua dari `gps.retention_days` (default 90 hari) dihapus dalam batch kecil (maksimal 500 baris per iterasi) untuk menghindari *table lock* pada basis data aktif.
   - Riwayat peringatan (`gps_alerts`) disimpan lebih lama (1 tahun) untuk kebutuhan audit forensik dan klaim asuransi jika terjadi sengketa.
   - Menggunakan PostgreSQL Advisory Lock (`749201`) untuk mencegah eksekusi ganda jika backend dijalankan dalam mode kluster/multi-instance.

---

## 7. Pemecahan Masalah (Troubleshooting)

### Q1: Muncul status `Offline` pada perangkat padahal motor sedang menyala.
- **Penyebab**: Perangkat belum mengirimkan paket data posisi dalam rentang waktu ambang batas `gps.offline_minutes` (default 15 menit).
- **Solusi**: Periksa koneksi kartu SIM GSM pada tracker (kuota internet aktif, sinyal GPRS tersedia), atau pastikan sekring aki tidak putus.

### Q2: Alert `keluar_area` berkedip saat motor berada persis di perbatasan area geofence.
- **Solusi**: Sistem RodaKita telah menerapkan histeresis margin sebesar 30 meter. Jika getaran sinyal GPS masih melompat di tepi, tingkatkan margin toleransi di `backend/src/utils/geo.js` atau perbesar radius geofence di panel admin.

### Q3: Tanda tangan HMAC ditolak (`INVALID_SIGNATURE` atau `401`).
- **Penyebab**: Stempel waktu antara server RodaKita dan pengirim berselisih lebih dari 5 menit (*replay attack protection*), atau secret key yang digunakan tidak cocok.
- **Solusi**: Sinkronkan NTP jam server pengirim dan cocokkan header `x-gps-secret` dengan konfigurasi backend.

---
Dokumen ini disusun untuk menjamin keandalan pemantauan armada RodaKita dan kemudahan integrasi perangkat pelacak fisik di masa mendatang.
