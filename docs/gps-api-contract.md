# Kontrak API & Arsitektur Fondasi GPS Tracking (RodaKita)

Dokumen ini mendefinisikan kontrak API, arsitektur adapter penyedia (provider adapter), skema database, aturan privasi lokasi, dan panduan simulator untuk modul pelacakan GPS armada motor RodaKita.

---

## 1. Prinsip Desain & Privasi Lokasi

1. **Proteksi Data Pribadi**:
   - Data koordinat dan telemetri lokasi adalah data pribadi sensitif.
   - **Hanya admin dan staff** yang memiliki hak akses untuk memantau koordinat GPS langsung dan riwayat rute.
   - Pelanggan **TIDAK** dapat melihat peta posisi langsung di sisi aplikasi publik; hanya ditampilkan pemberitahuan resmi bahwa unit motor dilengkapi fitur keamanan pelacak GPS.
   - Setiap pemesanan mencatat timestamp persetujuan pelanggan (`gps_consent_at`) saat booking dibuat.
2. **Kebijakan Retensi Data**:
   - Default masa simpan histori posisi adalah **90 hari** (`GPS_RETENTION_DAYS=90`).
   - Riwayat posisi yang melebihi batas retensi dibersihkan secara otomatis via scheduled cleanup job.
3. **Fondasi Simulator & Provider Adapter yang Dapat Diganti**:
   - Dirancang modular berbasis *Strategy Pattern* (`BaseGpsProvider`).
   - Mendukung simulator virtual dan penyedia nyata (Traccar Open Source GPS Platform, Webhook vendor komersial).
   - Penggantian vendor fisik tidak mengubah logika internal sistem atau skema basis data.
4. **Keamanan Tanpa Engine Kill Jarak Jauh**:
   - Sesuai regulasi keselamatan berkendara, sistem secara sengaja **tidak** mengimplementasikan fitur mematikan mesin motor jarak jauh (*remote engine cut-off*) yang berisiko fatal jika motor sedang melaju di jalan raya.

---

## 2. Skema Basis Data (Tabel & Indeks)

### A. Tabel `gps_devices`
Mencatat informasi alat GPS yang terpasang pada satu unit motor tertentu.

| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | SERIAL PRIMARY KEY | ID unik internal |
| `motorcycle_id` | INTEGER NOT NULL UNIQUE REFERENCES motorcycles(id) | Relasi 1-to-1 ke motor |
| `provider` | VARCHAR(50) NOT NULL DEFAULT 'simulator' | `simulator`, `traccar`, `generic_webhook` |
| `external_id` | VARCHAR(100) NOT NULL UNIQUE | IMEI atau identifier fisik unik alat pelacak |
| `label` | VARCHAR(100) NOT NULL | Label pengenal (mis. "GPS Vario 160 AB-1234-CD") |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | Status keaktifan tracker |
| `last_seen_at` | TIMESTAMPTZ | Waktu terakhir telemetri valid diterima |
| `battery_pct` | NUMERIC(5, 2) | Persentase sisa daya baterai alat (0 - 100%) |
| `installed_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu pemasangan fisik pada motor |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu pendaftaran record |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu modifikasi terakhir |

*Indeks*:
- `idx_gps_devices_motorcycle_id` on (`motorcycle_id`)
- `idx_gps_devices_external_id` on (`external_id`)
- `idx_gps_devices_is_active` on (`is_active`)

---

### B. Tabel `gps_positions`
Menyimpan log koordinat time-series dari setiap alat GPS.

| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | BIGSERIAL PRIMARY KEY | ID urutan log posisi |
| `device_id` | INTEGER NOT NULL REFERENCES gps_devices(id) | Relasi ke perangkat GPS |
| `recorded_at` | TIMESTAMPTZ NOT NULL | Timestamp pencatatan waktu satelit GPS |
| `lat` | NUMERIC(10, 7) NOT NULL | Garis lintang (-90.0 s/d 90.0) |
| `lng` | NUMERIC(10, 7) NOT NULL | Garis bujur (-180.0 s/d 180.0) |
| `speed_kmh` | NUMERIC(6, 2) NOT NULL DEFAULT 0 | Kecepatan dalam km/jam |
| `heading` | NUMERIC(5, 2) NOT NULL DEFAULT 0 | Arah kompas sudut 0° - 359° |
| `accuracy_m` | NUMERIC(6, 2) | Estimasi akurasi satelit dalam meter |
| `ignition` | BOOLEAN NOT NULL DEFAULT false | Status kunci kontak/mesin (`true` = On, `false` = Off) |
| `battery_pct` | NUMERIC(5, 2) | Status baterai perangkat saat posisi dicatat |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu penyimpanan ke database |

*Kekangan Unik & Indeks*:
- `CONSTRAINT uq_gps_positions_device_recorded UNIQUE (device_id, recorded_at)` (menjamin sifat idempotent)
- `CREATE INDEX idx_gps_positions_device_recorded ON gps_positions (device_id, recorded_at DESC)` (optimasi query posisi terbaru & riwayat)
- `CREATE INDEX idx_gps_positions_recorded_at ON gps_positions (recorded_at)` (optimasi pembersihan retensi berkala)

---

### C. Tabel `geofences`
Mendefinisikan batas zona geografis operasional motor (misal: Wilayah DIY, Zona Terlarang).

| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | SERIAL PRIMARY KEY | ID geofence |
| `name` | VARCHAR(100) NOT NULL | Nama zona (mis. "Zona Operasional DIY", "Area Lereng Merapi") |
| `type` | VARCHAR(20) NOT NULL | `'circle'` atau `'polygon'` |
| `geometry` | JSONB NOT NULL | Detail geometri geofence (lihat contoh di bawah) |
| `applies_to` | JSONB NOT NULL DEFAULT '"all"' | `"all"` atau array motor ID `[1, 2, 5]` |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | Status aktif zona |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu pembuatan |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu pembaruan |

*Format Geometri Geofence*:
- **Circle**:
  ```json
  {
    "center": { "lat": -7.7829, "lng": 110.3670 },
    "radiusMeters": 25000
  }
  ```
- **Polygon**:
  ```json
  {
    "coordinates": [
      { "lat": -7.7000, "lng": 110.3000 },
      { "lat": -7.7000, "lng": 110.5000 },
      { "lat": -7.9000, "lng": 110.5000 },
      { "lat": -7.9000, "lng": 110.3000 }
    ]
  }
  ```

---

### D. Tabel `gps_alerts`
Mencatat pelanggaran atau anomali telemetri yang terdeteksi.

| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | SERIAL PRIMARY KEY | ID peringatan |
| `device_id` | INTEGER NOT NULL REFERENCES gps_devices(id) | Relasi ke perangkat |
| `booking_id` | INTEGER REFERENCES bookings(id) | ID booking aktif jika ada, atau `null` jika tanpa sewa |
| `type` | VARCHAR(50) NOT NULL | `geofence_exit`, `speed_limit_exceeded`, `no_signal`, `low_battery`, `power_cut`, `unauthorized_movement`, `late_return_moving` |
| `severity` | VARCHAR(20) NOT NULL | `'low'`, `'medium'`, `'high'`, `'critical'` |
| `details` | JSONB NOT NULL DEFAULT '{}' | Metadata tambahan (kecepatan, nama geofence, penyewa, dsb.) |
| `dedupe_key` | VARCHAR(255) | Kunci deduplikasi untuk debouncing (mencegah spam alert berulang) |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu peringatan terdeteksi |
| `acknowledged_by` | INTEGER REFERENCES users(id) | Admin/staff yang mengonfirmasi/menangani |
| `acknowledged_at` | TIMESTAMPTZ | Waktu konfirmasi |

---

## 3. Kontrak Endpoint Ingest Telemetri

### `POST /api/gps/ingest`
Menerima kiriman koordinat dari simulator, platform Traccar, atau webhook vendor GPS eksternal.

#### Headers Autentikasi
Penyedia wajib menyertakan salah satu metode autentikasi berikut:
1. **Shared Secret**:
   - `X-Gps-Secret: <GPS_INGEST_SECRET>` atau `X-Api-Key: <GPS_INGEST_SECRET>`
2. **HMAC SHA-256 Signature**:
   - `X-Gps-Signature: sha256=<hex_hmac_sha256_of_raw_body>` (kunci = `GPS_INGEST_SECRET`)

#### Identifikasi Provider
Bisa ditentukan lewat:
- Query param: `?provider=simulator`, `?provider=traccar`, `?provider=generic_webhook`
- Header: `X-Gps-Provider: simulator`
- Auto-detection payload JSON jika tidak ditentukan.

---

### Contoh Payload Sesuai Provider

#### 1. Provider Simulator / RodaKita Native
```json
{
  "externalId": "GPS-SIM-VARIO-01",
  "recordedAt": "2026-10-25T07:15:00.000Z",
  "lat": -7.7829,
  "lng": 110.3670,
  "speedKmh": 38.5,
  "heading": 90,
  "accuracyM": 4.5,
  "ignition": true,
  "batteryPct": 85,
  "powerCut": false
}
```

#### 2. Provider Traccar Webhook
```json
{
  "event": "position",
  "device": {
    "id": 101,
    "uniqueId": "TRACCAR-UNIT-8821",
    "name": "Honda PCX 160 AB-5678-XY"
  },
  "position": {
    "fixTime": "2026-10-25T07:15:00.000Z",
    "latitude": -7.7829,
    "longitude": 110.3670,
    "speed": 21.0,
    "course": 90,
    "accuracy": 3.8,
    "attributes": {
      "ignition": true,
      "batteryLevel": 85,
      "alarm": null
    }
  }
}
```

#### 3. Provider Generic Webhook (Mendukung Batch Array)
```json
[
  {
    "externalId": "VENDOR-GPS-992",
    "timestamp": "2026-10-25T07:14:50.000Z",
    "lat": -7.7825,
    "lng": 110.3665,
    "speedKmh": 42.0,
    "heading": 85,
    "ignition": true,
    "batteryPct": 92
  },
  {
    "externalId": "VENDOR-GPS-992",
    "timestamp": "2026-10-25T07:15:00.000Z",
    "lat": -7.7829,
    "lng": 110.3670,
    "speedKmh": 40.0,
    "heading": 90,
    "ignition": true,
    "batteryPct": 92
  }
]
```

---

### Respon Sukses (200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data posisi GPS berhasil diproses.",
  "data": {
    "provider": "simulator",
    "processed": 1,
    "items": [
      {
        "deviceId": 1,
        "externalId": "GPS-SIM-VARIO-01",
        "recordedAt": "2026-10-25T07:15:00.000Z",
        "lat": -7.7829,
        "lng": 110.367,
        "isDuplicate": false,
        "isNewest": true
      }
    ]
  }
}
```

---

### Tabel Penanganan Error & Kode HTTP

| Status Code | Error Code | Penyebab & Penanganan |
| :--- | :--- | :--- |
| `400` | `MALFORMED_GPS_PAYLOAD` | Format payload bukan JSON valid atau field mandatory hilang |
| `400` | `INVALID_LATITUDE` | Latitude berada di luar rentang valid `[-90, 90]` |
| `400` | `INVALID_LONGITUDE` | Longitude berada di luar rentang valid `[-180, 180]` |
| `400` | `FUTURE_POSITION_REJECTED` | Timestamp posisi > 5 menit di masa depan server time |
| `400` | `STALE_POSITION_REJECTED` | Timestamp posisi > 30 hari di masa lampau |
| `400` | `EMPTY_GPS_PAYLOAD` | Array posisi kosong |
| `401` | `UNAUTHORIZED_PROVIDER` | Header Secret / Signature HMAC tidak cocok |
| `403` | `DEVICE_INACTIVE` | Perangkat GPS tercatat nonaktif di sistem |
| `404` | `DEVICE_NOT_FOUND` | `externalId` tidak terdaftar pada tabel `gps_devices` |
| `429` | `DEVICE_RATE_LIMIT_EXCEEDED`| Perangkat mengirim lebih dari 5 request per detik |

---

## 4. Fitur Ketahanan Ingest (Robustness)

1. **Idempotensi Penuh**:
   - Berkat kekangan unik `UNIQUE(device_id, recorded_at)` dan klausa `ON CONFLICT DO NOTHING`, pengiriman ulang payload yang sama persis tidak menghasilkan error 500 dan tidak membuat data ganda (`isDuplicate: true`).
2. **Penanganan Urutan Terbalik (Out-of-Order / Delayed Data)**:
   - Posisi historis yang masuk terlambat (misalnya akibat buffering sinyal saat masuk basement/daerah terpencil) tetap dicatat ke histori posisi, namun status `last_seen_at` pada `gps_devices` **tidak dimundurkan**.
3. **Throttled Realtime Broadcast**:
   - Penyiaran SSE `gps.position` ke admin dibatasi maksimal 1 pembaruan per 3 detik per perangkat (`BROADCAST_MIN_INTERVAL_MS = 3000`) untuk mencegah overload frontend dan bandwidth.
4. **Anti-Crash Protection**:
   - Parsing JSON dan validasi data dibungkus dalam blok try-catch yang aman sehingga payload rusak/ilegal tidak menjatuhkan server backend.

---

## 5. Panduan Penggunaan Simulator

Simulator dijalankan melalui skrip Node.js dengan perintah npm standar:

```bash
# Menjalankan simulasi normal (bergerak di sekitar titik dasar Yogyakarta)
npm run gps:simulate

# Menjalankan skenario khusus:
npm run gps:simulate -- --scenario geofence_exit    # Motor keluar area operasional
npm run gps:simulate -- --scenario no_signal        # Simulasi hilang sinyal / blank spot
npm run gps:simulate -- --scenario low_battery      # Penurunan baterai kritis < 15%
npm run gps:simulate -- --scenario power_cut        # Kabel aki diputus (beralih ke baterai internal)
npm run gps:simulate -- --scenario unauthorized_movement # Mesin menyala / gerak tanpa booking

# Parameter Tambahan:
npm run gps:simulate -- --interval 2000 --device GPS-SIM-VARIO-01 --steps 10
```
