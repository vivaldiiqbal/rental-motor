# ARCHITECTURE.md --- RodaKita

**Dokumen arsitektur teknis --- Rilis 1 (MVP)**\
**Produk:** RodaKita Platform Rental Motor Online\
**Versi acuan produk:** PRD & MVP v2.0, 25 Oktober 2026\
**Dokumen pendamping:** `AGENTS.md`\
**Status:** Baseline arsitektur yang diturunkan dari PRD; keputusan yang
belum ditetapkan PRD ditandai secara eksplisit.

------------------------------------------------------------------------

## 1. Tujuan dan aturan penggunaan dokumen

Dokumen ini menjelaskan batas sistem, tanggung jawab komponen, aliran
data, konsistensi, keamanan, dan cara menguji RodaKita agar implementasi
tetap sejalan dengan PRD v2.0 dan instruksi kerja di `AGENTS.md`.

Urutan acuan ketika membuat keputusan:

1.  **PRD v2.0** menentukan kebutuhan produk, aturan bisnis, ruang
    lingkup rilis, dan kriteria penerimaan.
2.  **`AGENTS.md`** menentukan cara coding agent memeriksa, mengubah,
    dan menguji repository tanpa mengarang kebutuhan.
3.  **Dokumen ini** menerjemahkan kedua sumber di atas menjadi
    arsitektur teknis. Dokumen ini tidak boleh mengubah aturan bisnis
    PRD.
4.  **Implementasi repository yang sudah ada** harus diperiksa sebelum
    memilih detail teknis yang belum ditentukan. Jangan menganggap
    diagram atau contoh nama endpoint di sini sudah menjadi kontrak API
    jika belum diimplementasikan/didokumentasikan di repository.

Jika terdapat konflik, jangan menyelesaikannya dengan asumsi diam-diam.
Catat konflik, jelaskan dampaknya, dan minta keputusan jika konflik
menyangkut kebijakan bisnis atau keamanan.

### 1.1 Label kepastian

-   **Ditetapkan PRD:** kebutuhan atau aturan yang eksplisit dalam PRD
    v2.0.
-   **Rekomendasi arsitektur:** pilihan teknis untuk menerapkan
    kebutuhan PRD; verifikasi terhadap repository sebelum mengadopsinya.
-   **Perlu konfirmasi:** keputusan bisnis/operasional yang ditandai
    terbuka dalam PRD. Jangan menganggapnya final.

------------------------------------------------------------------------

## 2. Sasaran arsitektur

Arsitektur harus mendukung sasaran berikut:

1.  Satu sumber kebenaran untuk profil penyewa, booking, pembayaran,
    status dokumen, dan ketersediaan.
2.  Tidak ada double booking, transisi status tidak sah, pembayaran
    ganda, atau aksi operasional ganda.
3.  Pemeriksaan kelayakan dan otorisasi ditegakkan di server; UI hanya
    menyajikan keadaan dan kemampuan yang diberikan server.
4.  Data pelanggan dan admin konsisten; perubahan penting tersiar
    melalui realtime setelah commit.
5.  Data identitas, dokumen, pembayaran, audit, dan lokasi dilindungi
    berdasarkan peran dan kebutuhan akses.
6.  Perubahan harga atau pengaturan tidak mengubah snapshot booking yang
    sudah dibuat.
7.  Setiap keputusan kritis dapat diuji dari API sampai PostgreSQL dan
    melalui alur browser.

### 2.1 Target nonfungsional dari PRD

  -----------------------------------------------------------------------
  Area                                Target/ketentuan PRD
  ----------------------------------- -----------------------------------
  API utama                           p95 maksimal 300 ms pada 10.000
                                      booking sintetis

  Realtime                            Perubahan tampil dalam 2 detik; p95
                                      maksimal 2 detik

  Ketersediaan                        Target uptime minimal 99%

  Frontend                            LCP di bawah 2,5 detik pada mobile

  Aksesibilitas                       WCAG AA; tes axe-core tanpa
                                      pelanggaran serius

  Keamanan                            Tidak ada pelanggaran
                                      otorisasi/kebocoran antar pengguna

  Kualitas                            Semua tes otomatis hijau dua kali
                                      berturut-turut sebelum rilis

  Cakupan service                     Minimal 85% sesuai gerbang rilis
                                      PRD
  -----------------------------------------------------------------------

Target tersebut adalah kriteria yang harus diukur, bukan klaim bahwa
implementasi saat ini telah mencapainya.

------------------------------------------------------------------------

## 3. Ruang lingkup Rilis 1

### 3.1 Termasuk dalam arsitektur MVP

-   Aplikasi web React untuk pelanggan dan panel admin/staf.
-   API Node.js/Express.
-   PostgreSQL sebagai sumber data transaksional.
-   Akun, profil penyewa, dokumen, verifikasi, persetujuan, dan
    otorisasi.
-   Katalog motor, kalender ketersediaan, booking, pembayaran manual,
    pembatalan, invoice, dan kwitansi.
-   Serah-terima, pengembalian, deposit, denda, no-show, booking manual,
    dan jadwal servis.
-   SSE untuk sinkronisasi pelanggan/admin/staf.
-   GPS melalui simulator dan antarmuka provider yang dapat diganti;
    peta/riwayat/peringatan untuk admin/staf.
-   Email transaksional, pengaturan dinamis, laporan dasar, pesan
    kontak, dan audit log.
-   Migrasi database, pemeriksaan integritas, pengujian, backup, dan
    pemulihan.

### 3.2 Tidak termasuk dalam Rilis 1

Jangan menjadikan hal-hal berikut ketergantungan wajib MVP:

-   Payment gateway atau webhook pembayaran nyata.
-   Perangkat GPS nyata; integrasi perangkat menjadi pekerjaan Rilis 2.
-   Aplikasi native, marketplace banyak pemilik, atau multi-cabang.
-   Penyewa warga negara asing.
-   Promo, add-on, diskon durasi, perpanjangan sewa, atau pembayaran
    sebagian.
-   Pemutus mesin jarak jauh.
-   2FA, notifikasi WhatsApp, kontrak digital bertanda tangan, dan
    integrasi akuntansi.

Fitur di luar lingkup tidak boleh diselundupkan ke implementasi MVP
tanpa perubahan ruang lingkup yang disetujui.

------------------------------------------------------------------------

## 4. Gambaran sistem

### 4.1 Diagram konteks

``` mermaid
flowchart LR
    Customer[Browser Pelanggan]
    Staff[Browser Admin / Staf]
    Web[React Web App]
    API[Node.js / Express API]
    DB[(PostgreSQL)]
    Files[(Penyimpanan privat dokumen dan foto)]
    Email[Provider Email]
    GPS[GPS Provider Interface]
    Sim[GPS Simulator]

    Customer --> Web
    Staff --> Web
    Web -->|HTTPS API| API
    Web <-->|SSE: event tanpa data pribadi| API
    API <--> DB
    API -->|akses terotorisasi| Files
    API --> Email
    API <--> GPS
    Sim --> GPS
```

**Catatan:** - Diagram menggambarkan batas logis, bukan jumlah server
atau deployment yang telah diputuskan. - PostgreSQL adalah sumber data
transaksional utama. - Dokumen identitas dan foto kondisi harus berada
di penyimpanan privat, bukan direktori publik. Jenis layanan penyimpanan
belum ditentukan oleh PRD; periksa konfigurasi repository sebelum
memilih implementasi. - SSE tidak menjadi sumber data utama. Event
memberitahu klien bahwa data berubah; klien kemudian mengambil data
terbaru melalui API yang memeriksa izin. - GPS MVP menggunakan simulator
melalui kontrak provider yang sama dengan jalur integrasi mendatang.

### 4.2 Rekomendasi bentuk deployment

**Rekomendasi:** mulai dari *modular monolith* dengan satu backend
Express yang dibagi menjadi modul domain. PRD menetapkan React,
Node.js/Express, dan PostgreSQL, tetapi tidak menetapkan microservices.
Modular monolith mengurangi kompleksitas transaksi lintas domain dan
deployment untuk MVP.

Pemisahan modul kode tidak berarti setiap modul harus menjadi service
atau proses terpisah. Pisahkan proses hanya bila ada kebutuhan
operasional yang terukur dan perubahan arsitektur disetujui.

------------------------------------------------------------------------

## 5. Batas tanggung jawab dan lapisan

``` mermaid
flowchart TB
    UI[React: halaman, formulir, status UI]
    HTTP[Express routes dan middleware]
    APP[Application services / use cases]
    DOMAIN[Domain rules: status, harga, kelayakan, izin]
    REPO[Repository / query terparameterisasi]
    DB[(PostgreSQL)]
    OUTBOX[Transactional outbox]
    WORKER[Dispatcher event / pekerjaan latar]
    SSE[SSE gateway]
    EXT[Adapter email dan GPS]

    UI --> HTTP
    HTTP --> APP
    APP --> DOMAIN
    APP --> REPO
    REPO <--> DB
    APP --> EXT
    DB --> OUTBOX
    OUTBOX --> WORKER
    WORKER --> SSE
    WORKER --> EXT
    SSE --> UI
```

Diagram ini adalah batas logis yang disarankan. Penjadwalan worker dan
mekanisme antrean konkret harus mengikuti kemampuan repository yang ada;
jangan menambahkan teknologi antrean eksternal hanya karena diagram
menunjukkan dispatcher.

### 5.1 React Web App

Tanggung jawab: - Menampilkan katalog, profil, dokumen, booking,
pembayaran, operasional sesuai peran, dan dashboard. - Menyediakan
keadaan memuat, kosong, galat, dan indikator koneksi realtime. -
Mengirim perintah pengguna melalui API. - Menampilkan `capabilities` dan
alasan dari server; tidak memutuskan sendiri apakah aksi diizinkan. -
Setelah menerima event SSE, mengambil data terkini dari API. - Mencegah
klik berulang pada UI sebagai bantuan UX, tanpa menganggapnya sebagai
perlindungan idempotensi utama.

Tidak boleh: - Menghitung harga final, kelayakan sewa, otorisasi,
transisi status, atau ketersediaan sebagai sumber kebenaran. -
Menampilkan nomor KTP utuh atau URL dokumen privat yang dapat diakses
tanpa otorisasi. - Menyimpan role yang dapat dipilih pengguna untuk
menaikkan hak akses. - Menyisipkan mock atau status hardcoded ke jalur
produksi.

### 5.2 Express API

Tanggung jawab: - Memvalidasi bentuk permintaan dan autentikasi. -
Memeriksa otorisasi pada setiap permintaan. - Memanggil application
service/domain service yang sesuai. - Mengubah error domain menjadi
respons HTTP yang konsisten dan pesan Bahasa Indonesia. - Mengeluarkan
`requestId` untuk observabilitas. - Menghasilkan tiket SSE sekali pakai
dengan masa berlaku 30 detik sesuai PRD. - Menyajikan data melalui API
biasa dengan pemeriksaan izin, termasuk setelah event realtime.

Controller tidak boleh menjadi satu-satunya tempat aturan bisnis berada.
Hindari menyalin aturan yang sama ke banyak endpoint.

### 5.3 Application service dan domain rules

Tanggung jawab: - Mengorkestrasi use case dan transaksi multi-tabel. -
Menjalankan mesin status dan kebijakan bisnis. - Memeriksa profil,
dokumen, masa berlaku SIM, usia, tanggal, ketersediaan, pembayaran,
pembatalan, serah-terima, pengembalian, dan deposit. - Menghasilkan
`capabilities` serta alasan untuk UI. - Menerapkan idempotensi dan
kontrol versi. - Menulis audit dan outbox dalam transaksi yang sama
dengan mutasi bisnis.

Aturan domain yang sama harus dipakai oleh alur pelanggan dan alur
admin/staf. Booking manual tidak boleh menjadi jalur pintas yang
melewati validasi booking biasa.

### 5.4 Repository/data access

Tanggung jawab: - Menjalankan query PostgreSQL terparameterisasi. -
Mengelola akses dan pemetaan data tanpa menyembunyikan aturan bisnis. -
Memastikan operasi menggunakan transaksi dan batas penguncian yang
sesuai. - Tidak menyusun SQL dari input mentah pengguna.

### 5.5 PostgreSQL

PostgreSQL menjaga integritas data yang tidak boleh bergantung pada
perilaku UI atau satu proses aplikasi: - Foreign key, unique constraint,
check constraint, dan exclusion constraint yang sesuai. - Keunikan plat
nomor, kode booking, nomor dokumen keuangan, serta identitas
terverifikasi sesuai model penyimpanan. - Pencegahan dua pembayaran
pending untuk satu booking. - Pencegahan rentang booking/servis yang
saling bertentangan. - Perlindungan transisi status bila trigger dipakai
oleh skema. - Transaksi untuk mutasi yang terdiri dari beberapa tabel. -
Outbox transaksional agar perubahan data dan catatan event tidak
terpisah.

Detail SQL dan nama tabel harus mengikuti skema repository dan migrasi
yang nyata; bagian berikut menyatakan kebutuhan data secara konseptual,
bukan memaksakan nama tabel final.

### 5.6 Adapter integrasi

-   **Email:** antarmuka provider terpisah; provider dan domain pengirim
    masih belum ditentukan.
-   **GPS:** antarmuka provider dengan simulator sebagai implementasi
    MVP. Integrasi Traccar/vendor nyata adalah tahap berikutnya.
-   **Penyimpanan privat:** akses dokumen/foto melalui layanan yang
    memeriksa izin, mencatat akses, dan tidak membuat file menjadi
    publik.
-   Jangan menambahkan integrasi eksternal atau secret yang tidak
    dibutuhkan untuk Rilis 1.

------------------------------------------------------------------------

## 6. Modul domain

Modul berikut adalah batas logis. Implementasi dapat menggunakan folder
atau struktur lain jika repository sudah mempunyai pola yang konsisten.

  --------------------------------------------------------------------------
  Modul                   Tanggung jawab utama    Invarian penting
  ----------------------- ----------------------- --------------------------
  Identity & Access       Akun, autentikasi,      Role dibaca dari server;
                          sesi/token, role, izin  admin terakhir tidak dapat
                                                  dinonaktifkan/diturunkan

  Renter Profile          Identitas, kontak,      Satu sumber data profil;
                          kontak darurat, alamat  field kosong tidak diisi
                          tinggal                 data karangan

  Documents & Consent     KTP, SIM C, selfie,     Dokumen privat; status
                          status verifikasi,      terpusat; perubahan
                          versi persetujuan       tertentu mengulang
                                                  verifikasi

  Fleet Catalog           Data motor, foto,       Plat unik; maksimum 8
                          harga, status           foto; satu foto utama

  Availability &          Kalender, rentang sewa, Pencegahan konflik pada
  Maintenance             blok servis             database; rentang tanggal
                                                  `[ambil, kembali)`

  Booking                 Pembuatan, snapshot,    Tidak ada double booking;
                          status, kedaluwarsa,    transisi sah saja
                          pembatalan              

  Payments & Finance      Pembayaran manual,      Satu pembayaran pending
                          deposit, invoice,       per booking; konfirmasi
                          kwitansi, refund status idempotent; uang tidak
                                                  digandakan

  Rental Operations       Serah-terima, foto      Transaksi atomik,
                          kondisi, pengembalian,  checklist kosong, operasi
                          denda, no-show          tidak dapat diulang

  Realtime                Outbox, event, tiket    Event tanpa data pribadi;
                          SSE, replay dan         isolasi per pengguna/peran
                          reconnect               

  GPS                     Perangkat, posisi,      Akses dibatasi; input
                          geofence, riwayat,      idempotent; retensi sesuai
                          peringatan, simulator   pengaturan

  Admin & Settings        Pengaturan,             Pengaturan divalidasi dan
                          pengguna/peran, pesan,  diaudit; snapshot lama
                          laporan, audit          tidak berubah

  Notifications           Email verifikasi,       Pengiriman dapat
                          status dokumen,         ditelusuri; kegagalan
                          booking, pengingat,     tidak memalsukan
                          pembatalan              keberhasilan
  --------------------------------------------------------------------------

### 6.1 Aturan dependensi antar modul

-   Modul UI tidak mengakses database secara langsung.
-   Controller memanggil service, bukan mengimplementasikan ulang domain
    rules.
-   Booking menggunakan Identity/Profile, Documents/Consent,
    Fleet/Availability, Settings, Payments, dan Audit sesuai use case.
-   Rental Operations menggunakan Booking, Payments, Fleet/Availability,
    Documents, dan Audit.
-   Realtime membaca event outbox; event bukan pengganti data domain.
-   GPS tidak memberikan akses kepada pelanggan ke koordinat/rute; sisi
    pelanggan hanya menampilkan pemberitahuan bahwa motor dilengkapi GPS
    sesuai PRD.
-   Hindari dependensi siklik antar modul. Bila dua modul memerlukan
    aturan bersama, tempatkan aturan tersebut di domain bersama yang
    jelas atau susun use case pada application layer.

------------------------------------------------------------------------

## 7. Model data konseptual

Model berikut menyatakan entitas yang dibutuhkan secara konseptual
berdasarkan PRD. Ini bukan pengganti desain ERD, migrasi, atau inspeksi
skema repository.

``` mermaid
erDiagram
    USER ||--o| RENTER_PROFILE : has
    RENTER_PROFILE ||--o{ RENTER_DOCUMENT : owns
    USER ||--o{ BOOKING : creates
    MOTOR ||--o{ BOOKING : reserved_for
    BOOKING ||--o| PAYMENT : has
    BOOKING ||--o| HANDOVER : records
    BOOKING ||--o| RETURN_RECORD : records
    MOTOR ||--o{ MAINTENANCE_BLOCK : has
    MOTOR ||--o{ MOTOR_PHOTO : has
    BOOKING ||--o{ FINANCIAL_DOCUMENT : issues
    USER ||--o{ CONSENT_RECORD : gives
    USER ||--o{ AUDIT_LOG : performs
    MOTOR ||--o| GPS_DEVICE : assigned
    GPS_DEVICE ||--o{ GPS_POSITION : reports
    GPS_DEVICE ||--o{ GPS_ALERT : raises
    USER ||--o{ CONTACT_MESSAGE : sends
    SETTINGS_VERSION ||--o{ BOOKING : snapshotted_by
    OUTBOX_EVENT }o--|| AUDIT_LOG : correlates
```

**Catatan model:** - Diagram ER konseptual tidak menentukan semua
kardinalitas, kolom, indeks, atau strategi penyimpanan. Validasi dan
rancangan final harus dibuat berdasarkan PRD serta repository. -
Hubungan outbox dan audit dapat diimplementasikan dengan correlation ID,
bukan foreign key langsung; diagram menunjukkan keterkaitan
audit/penelusuran secara konseptual. - Booking harus menyimpan snapshot
penyewa, harga, aturan yang berlaku, versi persetujuan/syarat, sumber
booking, rentang waktu, dan versi data yang diperlukan. - Nomor KTP
untuk pencocokan disimpan dalam bentuk HMAC-SHA256 dan empat digit
terakhir; hindari menyimpan nomor lengkap bila tidak diperlukan. -
Dokumen identitas dan foto kondisi tidak boleh disajikan sebagai aset
publik. - Pembayaran harus merekam metode pilihan pelanggan dan metode
konfirmasi secara terpisah jika keduanya berbeda. - Tabel dan nama kolom
final harus ditetapkan melalui migrasi yang konsisten, bukan disalin
mentah dari diagram ini.

### 7.1 Invarian database minimum

Implementasi skema perlu menjaga setidaknya:

1.  Kode booking unik dengan format `RM-YYMMDD-XXXX`.
2.  Plat nomor motor unik.
3.  Nomor invoice/kwitansi unik dan stabil setelah diterbitkan.
4.  Satu pembayaran pending per booking.
5.  Satu nomor KTP terverifikasi hanya untuk satu akun.
6.  Rentang booking aktif yang saling tumpang tindih untuk motor yang
    sama ditolak.
7.  Rentang servis yang konflik dengan booking yang dilindungi ditolak.
8.  Status hanya berubah melalui transisi yang sah.
9.  Hubungan booking, pembayaran, serah-terima, pengembalian, dan motor
    tidak boleh menjadi yatim.
10. Mutasi bisnis dan audit/outbox yang diwajibkan berhasil atau gagal
    bersama-sama.

Constraint spesifik (termasuk bentuk exclusion constraint PostgreSQL)
harus mengikuti tipe kolom, strategi rentang tanggal, dan skema aktual.
Jangan menganggap validasi aplikasi saja cukup untuk menjamin
konkurensi.

------------------------------------------------------------------------

## 8. Kontrak konsistensi dan transaksi

### 8.1 Prinsip umum

-   Semua uang disimpan/dihitung dalam Rupiah bulat atau tipe numerik
    yang aman; jangan menggunakan floating-point biasa untuk kalkulasi
    uang.
-   Semua aturan tanggal/jam bisnis yang ditetapkan PRD menggunakan WIB
    secara eksplisit.
-   Gunakan transaksi database untuk aksi multi-tabel yang membentuk
    satu hasil bisnis.
-   Gunakan idempotency key atau mekanisme deduplikasi yang sesuai pada
    operasi yang dapat diulang; jangan menganggap tombol disabled
    sebagai idempotensi.
-   Gunakan kontrol `version` untuk mencegah perubahan dari data yang
    sudah usang.
-   Jika versi tidak cocok, kembalikan HTTP 409 dengan kode
    `STALE_DATA`, lalu minta UI memuat data terbaru.
-   Audit yang diwajibkan harus ditulis dalam transaksi yang sama. Jika
    audit gagal, mutasi dibatalkan.
-   Catat event outbox dalam transaksi yang sama, tetapi kirim event
    hanya setelah transaksi commit.

### 8.2 Alur pembuatan booking

``` mermaid
sequenceDiagram
    actor C as Pelanggan
    participant API as Express API
    participant S as Booking Service
    participant DB as PostgreSQL
    participant O as Outbox Dispatcher

    C->>API: Buat booking + rentang tanggal + versi
    API->>S: Validasi identitas dan izin
    S->>DB: Mulai transaksi
    S->>DB: Periksa profil, dokumen, persetujuan, aturan dan harga
    S->>DB: Kunci/constraint ketersediaan + simpan snapshot booking
    S->>DB: Simpan pembayaran pending sesuai metode
    S->>DB: Simpan audit + event outbox
    S->>DB: Commit
    DB-->>S: Berhasil
    S-->>API: Booking + capabilities
    API-->>C: Respons API
    O->>DB: Ambil event outbox yang siap
    O-->>C: SSE memberitahu perubahan (tanpa data pribadi)
```

Urutan persis query dan apakah pembayaran pending dibuat di transaksi
yang sama harus mengikuti model pembayaran yang dipilih di repository;
semua bagian yang merupakan satu aksi bisnis wajib konsisten dan atomik.
Jangan mengirim event sebelum commit.

Jika profil tidak lengkap, permintaan booking harus ditolak oleh server
dengan HTTP 403, kode `PROFILE_INCOMPLETE`, dan daftar kekurangan.
Ketersediaan diperiksa dan dijaga secara atomik, bukan dengan
pemeriksaan UI saja.

### 8.3 Alur pembayaran manual

1.  Pelanggan memilih metode pembayaran yang tersedia.
2.  Server menyimpan pilihan tersebut pada baris pembayaran pending yang
    terkait dengan booking.
3.  Jika pelanggan mengirim bukti, status pembayaran mengikuti mesin
    status PRD (`submitted`).
4.  Admin/staf berwenang memeriksa bukti dan mengonfirmasi pembayaran
    sesuai matriks izin.
5.  Service memeriksa status booking/pembayaran, jumlah yang harus
    dibayar, versi, dan idempotensi.
6.  Dalam transaksi, service memperbarui baris pembayaran yang sama,
    menyimpan audit, menerbitkan invoice/kwitansi sesuai aturan PRD, dan
    menulis event outbox.
7.  Setelah commit, pelanggan dan admin menerima event; masing-masing
    mengambil data terbaru melalui API.

Jika pembayaran masuk setelah booking dibatalkan, pembayaran harus
diarahkan ke `needs_refund`, bukan menghidupkan kembali booking secara
otomatis. Konfirmasi pembayaran tidak boleh membuat baris pembayaran
baru.

### 8.4 Alur pembatalan

-   **Online belum dibayar dan belum ada bukti:** pelanggan boleh
    membatalkan.
-   **Online bukti sudah dikirim atau sudah dibayar:** pelanggan tidak
    boleh membatalkan; tindak lanjut mengikuti admin/policy PRD.
-   **Tunai sebelum serah-terima:** pelanggan/admin boleh membatalkan.
-   **Booking berbayar:** hanya admin dapat membatalkan, dengan alasan
    dan keputusan refund; staf tidak boleh melakukannya.
-   Pembatalan dan pembayaran yang berkompetisi harus
    diserialisasi/dilindungi transaksi agar hanya hasil yang sah yang
    menang.
-   Pembatalan melepaskan slot secara konsisten. Bila uang diterima
    setelah pembatalan, tandai `needs_refund`.

Jangan mengimplementasikan refund otomatis atau kebijakan refund baru di
luar PRD.

### 8.5 Alur "Terima Tunai & Serah Terima"

Dalam satu transaksi atomik:

1.  Periksa izin petugas dan versi data.
2.  Periksa profil lengkap, dokumen terverifikasi/berlaku, tanggal sewa,
    dan checklist yang telah diisi.
3.  Catat pembayaran tunai untuk sewa dan deposit.
4.  Simpan catatan serah-terima, odometer, bensin, kondisi, dan foto
    yang diwajibkan.
5.  Ubah booking menjadi `active`.
6.  Simpan audit dan outbox.
7.  Commit; baru setelah commit event realtime boleh dikirim.

Jika salah satu langkah gagal, tidak boleh ada pembayaran tunai,
serah-terima, atau status `active` yang tersisa sebagian.

### 8.6 Alur pengembalian

-   Pastikan booking berstatus `active` dan versi masih cocok.
-   Validasi odometer akhir tidak lebih rendah daripada odometer awal.
-   Catat bensin, kondisi, foto minimal empat sisi dan odometer,
    kerusakan/biaya lain, keterlambatan, serta perhitungan deposit.
-   Hitung denda di server menggunakan aturan snapshot/aturan yang
    berlaku pada booking sesuai PRD.
-   Simpan pengembalian dan perubahan status ke `completed` secara
    atomik.
-   Cegah pemrosesan ulang. Pengembalian deposit hanya dapat ditandai
    satu kali dengan petugas dan waktu tercatat.
-   Jika potongan melebihi deposit, catat kurang bayar sesuai model
    bisnis; jangan mengubah definisi pendapatan.

------------------------------------------------------------------------

## 9. Mesin status

Status internal adalah nilai domain/API/database; label UI berasal dari
satu pemetaan bersama dan berbahasa Indonesia.

### 9.1 Booking

  -----------------------------------------------------------------------
  Status                  Transisi yang diizinkan Catatan
  ----------------------- ----------------------- -----------------------
  `pending`               `confirmed`, `active`   Konteks online/tunai
                          khusus alur tunai       membedakan tampilan dan
                          atomik, `cancelled`,    aksi
                          `expired`               

  `confirmed`             `active`, `cancelled`   Pembatalan booking
                                                  berbayar hanya oleh
                                                  admin dengan
                                                  alasan/keputusan
                                                  refund; no-show sesuai
                                                  aturan

  `active`                `completed`             Diselesaikan melalui
                                                  pengembalian

  `completed`             Tidak ada               Status akhir

  `cancelled`             Tidak ada               Status akhir

  `expired`               Tidak ada               Status akhir
  -----------------------------------------------------------------------

### 9.2 Pembayaran

  -----------------------------------------------------------------------
  Status                              Transisi yang diizinkan
  ----------------------------------- -----------------------------------
  `pending`                           `submitted`, `paid`, `cancelled`,
                                      `expired`

  `submitted`                         `paid` atau kembali ke `pending`
                                      dengan catatan penolakan

  `paid`                              `refunded`, `needs_refund`

  `needs_refund`                      `refunded`

  `cancelled`, `expired`, `refunded`  Tidak ada
  -----------------------------------------------------------------------

### 9.3 Dokumen

  Status                  Transisi yang diizinkan
  ----------------------- --------------------------------------------------
  `not_uploaded`          `pending`
  `pending`               `verified`, `rejected`
  `verified`              `pending` saat data/file berubah, atau `expired`
  `rejected`, `expired`   `pending` setelah unggah ulang

Transisi yang tidak tercantum harus ditolak oleh domain service dan
dilindungi database sejauh rancangan skema memungkinkan. Jangan menambah
transisi hanya untuk memudahkan UI.

------------------------------------------------------------------------

## 10. API dan kontrak respons

PRD menetapkan perilaku, bukan seluruh daftar URL endpoint. Karena itu,
contoh di bawah adalah **pembagian resource konseptual**, bukan klaim
bahwa path tersebut sudah ada atau harus digunakan persis.

### 10.1 Kelompok resource yang diperlukan

-   Authentication dan akun.
-   Profil penyewa, dokumen, persetujuan.
-   Katalog motor dan kalender ketersediaan.
-   Booking, capabilities, pembatalan.
-   Pembayaran, bukti pembayaran, invoice, kwitansi, deposit.
-   Serah-terima, pengembalian, no-show.
-   Armada, foto, jadwal servis.
-   Pengaturan, pengguna/peran, pesan, laporan, audit.
-   GPS: perangkat, posisi, rute, peringatan.
-   Realtime: tiket SSE dan stream event.
-   Health check dan verifikasi integritas sesuai kebutuhan deployment.

### 10.2 Standar respons

-   Gunakan kontrak respons yang konsisten sesuai konvensi repository.
-   Validasi input di server; jangan mempercayai field otorisasi, harga,
    status, atau role dari klien.
-   Sertakan kode error terstruktur untuk mesin dan pesan yang bisa
    dimengerti pengguna.
-   Contoh error domain yang ditetapkan PRD:
    -   `403 PROFILE_INCOMPLETE`: booking ditolak, dengan daftar
        kekurangan.
    -   `409 STALE_DATA`: versi yang dikirim klien sudah usang.
-   Jangan menampilkan kode internal mentah sebagai pesan utama UI.
-   Respons operasi yang mengubah status sebaiknya mengembalikan status
    terbaru, `version`, dan `capabilities` yang relevan.
-   Jangan mengirim dokumen identitas, nomor KTP utuh, atau koordinat
    GPS dalam event umum.

### 10.3 Capabilities dari server

Contoh konsep respons (bukan kontrak JSON final):

``` json
{
  "id": "resource-id",
  "version": 4,
  "status": "pending",
  "capabilities": {
    "canCancel": {
      "allowed": true,
      "reason": null
    },
    "canPay": {
      "allowed": true,
      "reason": null
    },
    "canHandover": {
      "allowed": false,
      "reason": "Dokumen penyewa belum terverifikasi."
    }
  }
}
```

Field final harus mengikuti kontrak API proyek. Nama status di atas
bersifat ilustratif; label pengguna tetap Bahasa Indonesia. UI tidak
boleh menggunakan contoh statis ini sebagai data produksi.

------------------------------------------------------------------------

## 11. Realtime dengan SSE dan transactional outbox

### 11.1 Mekanisme

1.  Mutasi domain dan record outbox disimpan dalam satu transaksi
    PostgreSQL.
2.  Dispatcher mengambil event yang sudah commit.
3.  Event dikirim melalui SSE ke koneksi yang sudah diotorisasi.
4.  Payload berisi jenis event, ID resource, dan `version`, tanpa data
    pribadi.
5.  Klien mengambil data terbaru melalui API biasa, yang memeriksa izin
    lagi.
6.  Jika klien terputus, dukung `Last-Event-ID` untuk replay dalam
    retensi 24 jam; setelah tersambung kembali, refresh data.
7.  Jika SSE terblokir, polling cadangan dipakai sesuai implementasi.
8.  Gunakan heartbeat, reconnect bertahap, indikator koneksi, dan batas
    koneksi per pengguna.

### 11.2 Jenis event yang diperlukan

Sesuai PRD, jenis event meliputi:

-   `booking.updated`
-   `payment.updated`
-   `document.updated`
-   `motor.availability.changed`
-   `counters.changed`
-   `message.new`
-   `settings.changed`
-   `gps.position` dan `gps.alert` untuk admin sesuai izin

Jangan memasukkan data pribadi ke payload. Nama event tidak menggantikan
otorisasi pada API.

### 11.3 Isolasi dan ketahanan

-   Pelanggan hanya menerima event miliknya.
-   Admin/staf menerima event sesuai peran dan izin.
-   Tiket SSE sekali pakai berumur 30 detik.
-   Reconnect harus membatasi beban dan memuat data terbaru.
-   Event tidak boleh dikirim sebelum commit.
-   Kegagalan pengiriman tidak boleh membatalkan mutasi bisnis yang
    sudah commit; outbox harus memungkinkan pengiriman ulang dengan
    deduplikasi yang sesuai.
-   Target perubahan terlihat di klien: paling lama 2 detik pada p95.

------------------------------------------------------------------------

## 12. Keamanan dan privasi

### 12.1 Autentikasi dan otorisasi

-   Periksa autentikasi dan izin di server pada setiap request.
-   Role berasal dari data server, bukan dari state UI atau input klien.
-   Terapkan matriks izin PRD untuk pelanggan, staf, dan admin.
-   Pelanggan hanya boleh mengakses profil dan booking miliknya.
-   Dokumen identitas dan lokasi hanya dapat diakses admin/staf
    berwenang.
-   Admin terakhir tidak dapat dinonaktifkan atau diturunkan perannya.
-   Batasi percobaan login; sandi admin minimal 12 karakter; sesi awal
    maksimal 8 jam; catat login.
-   PRD menetapkan bcrypt untuk hash sandi dan JWT untuk autentikasi;
    implementasi token harus mengikuti praktik penyimpanan dan validasi
    yang aman sesuai repository.

### 12.2 Dokumen dan file

-   Maksimal 2 MB untuk KTP/SIM/selfie; format JPG/PNG/WebP; validasi
    magic bytes.
-   Simpan file privat di luar direktori web publik.
-   Unduhan/preview dilakukan melalui endpoint atau mekanisme akses yang
    memeriksa izin dan mencatat akses.
-   Hindari path traversal, nama file yang dikontrol pengguna, dan file
    yang dieksekusi.
-   Foto kondisi serah-terima/pengembalian juga privat dan aksesnya
    dibatasi.

### 12.3 Data sensitif dan log

-   Nomor KTP untuk pencocokan memakai HMAC-SHA256; tampilan hanya empat
    digit terakhir.
-   Jangan mencatat sandi, token, nomor KTP utuh, isi dokumen, atau
    secret di log.
-   Log terstruktur memakai `requestId`; audit menyimpan konteks yang
    dibutuhkan tanpa menyalin data sensitif berlebihan.
-   Ekspor CSV harus aman dari formula injection.
-   Terapkan CORS terbatas, HTTPS di production, validasi/sanitasi
    input, query terparameterisasi, dan rate limit.
-   Jangan menyimpan data kartu pembayaran.

### 12.4 Persetujuan, retensi, dan kepatuhan

-   Simpan versi, waktu, dan IP untuk persetujuan Syarat Sewa, Kebijakan
    Privasi, serta pelacakan GPS.
-   Booking menyimpan versi syarat yang berlaku saat disetujui.
-   Retensi data harus dikonfigurasi dan job pembersih harus diaudit.
-   Retensi lokasi 90 hari adalah nilai awal yang masih perlu konfirmasi
    di PRD.
-   Teks Syarat Sewa dan Kebijakan Privasi perlu ditinjau penasihat
    hukum sebelum peluncuran.

------------------------------------------------------------------------

## 13. GPS MVP

### 13.1 Struktur

GPS dibangun melalui kontrak provider sehingga simulator dapat diganti
dengan integrasi nyata pada rilis berikutnya.

``` mermaid
flowchart LR
    Simulator[Simulator GPS] --> Provider[GPS Provider Interface]
    DeviceAdapter[Adapter perangkat di rilis mendatang] -.-> Provider
    Provider --> Ingest[Validasi dan deduplikasi posisi]
    Ingest --> DB[(PostgreSQL)]
    DB --> Alerts[Evaluasi geofence dan peringatan]
    DB --> AdminUI[Admin/Staf: peta, riwayat, peringatan]
    Alerts --> Outbox[Outbox]
    Outbox --> SSE[SSE admin/staf]
```

### 13.2 Perilaku MVP

-   Registrasi, penonaktifan, dan penggantian perangkat tercatat.
-   Satu perangkat terdaftar untuk satu motor sesuai PRD.
-   Posisi yang rusak, duplikat, atau datang tidak berurutan tidak boleh
    merusak data.
-   Peta langsung, riwayat rute, dan peringatan tersedia bagi admin/staf
    berwenang.
-   Peringatan mencakup keluar area, offline, daya terputus, gerak tanpa
    sewa, dan keterlambatan kembali sesuai kondisi yang dapat
    disimulasikan.
-   Peringatan perlu debounce dan dapat diakui petugas.
-   Catat akses lokasi; retensi mengikuti pengaturan.
-   Pelanggan hanya melihat pemberitahuan bahwa motor dilengkapi GPS,
    bukan peta/rute.
-   Tidak ada perintah mematikan mesin.

### 13.3 Batas integrasi

PRD belum menentukan merek/model perangkat, kartu data, atau penyedia
GPS final. Jangan mengklaim integrasi perangkat nyata sudah didukung
hanya karena antarmuka provider tersedia.

------------------------------------------------------------------------

## 14. Pekerjaan latar dan penjadwalan

Sistem memerlukan pekerjaan yang tidak bergantung pada pengguna membuka
halaman, antara lain:

-   Kedaluwarsa booking online setelah batas awal 60 menit.
-   Kedaluwarsa booking tunai setelah jam ambil ditambah batas tunggu.
-   Pengingat dan email transaksional.
-   Pemrosesan outbox dan pengiriman ulang event.
-   Pembersihan data yang melewati retensi.
-   Perhitungan status servis berdasarkan tanggal WIB.
-   Pemrosesan/penilaian GPS dan peringatan jika tidak dapat dihitung
    langsung ketika posisi masuk.

**Rekomendasi:** gunakan mekanisme job/worker yang sesuai dengan
repository dan lingkungan deployment. PRD tidak menetapkan library
scheduler, antrean, atau layanan terpisah; jangan menambahkan
infrastruktur baru tanpa kebutuhan terukur.

Pekerjaan harus idempotent, memiliki log dan metrik, aman dijalankan
ulang, serta tidak mengubah snapshot booking lama. Waktu dan batas
operasional diambil dari pengaturan tervalidasi dan aturan snapshot yang
sesuai.

------------------------------------------------------------------------

## 15. Observabilitas, kegagalan, dan pemulihan

-   Log terstruktur dengan `requestId`.
-   Health check menunjukkan status database, bukan hanya bahwa proses
    HTTP hidup.
-   Catat kegagalan transaksi, audit, outbox, email, SSE, dan GPS tanpa
    membocorkan data pribadi.
-   Error yang ditampilkan ke pengguna menggunakan Bahasa Indonesia dan
    menyebut langkah berikutnya bila memungkinkan.
-   Satu kegagalan menghasilkan satu toast pada UI.
-   Koneksi database dan SSE pulih dengan mekanisme retry/backoff yang
    terbatas.
-   Kegagalan email tidak boleh membuat aplikasi berpura-pura bahwa
    email sudah terkirim.
-   Kegagalan dispatcher tidak boleh menghilangkan event yang telah
    tercatat di outbox.
-   Shutdown harus aman dan tidak meninggalkan transaksi/pekerjaan
    setengah jalan.
-   Backup database terenkripsi disimpan di luar server dan pemulihannya
    diuji saat deployment.

Detail platform logging, metrics, alerting, dan backup harus mengikuti
infrastruktur yang benar-benar digunakan; PRD tidak menetapkan vendor
tertentu.

------------------------------------------------------------------------

## 16. Migrasi, konfigurasi, dan lingkungan

### 16.1 Migrasi database

-   Migrasi berurutan dan memiliki checksum.
-   Jangan mengedit migrasi yang sudah diterapkan ke lingkungan bersama
    tanpa strategi koreksi yang aman.
-   Constraint dan indeks dibuat berdasarkan pola query dan invarian
    bisnis.
-   Perubahan skema yang tidak kompatibel perlu strategi migrasi
    bertahap bila aplikasi lama masih berjalan.
-   Jalankan pemeriksaan integritas setelah migrasi yang berisiko.

### 16.2 Konfigurasi

-   Rahasia disimpan di environment/secret store, bukan repository.
-   Validasi konfigurasi saat startup; kegagalan konfigurasi penting
    harus jelas dan fail-safe.
-   Pengaturan bisnis yang dinamis disimpan di database, divalidasi, dan
    diaudit.
-   Nilai database menang atas default konfigurasi untuk pengaturan
    dinamis sesuai PRD.
-   Booking menyimpan snapshot aturan yang berlaku saat dibuat.
-   Jangan menggunakan feature flag untuk menonaktifkan pemeriksaan
    wajib profil/dokumen di production.

### 16.3 Data uji

-   Seed hanya untuk development/tes otomatis yang terisolasi.
-   Seed harus menolak berjalan di production.
-   Data mock tidak boleh memasuki jalur produksi.
-   Skrip pembersih harus memverifikasi target, memiliki pengaman
    eksplisit, dan tidak berjalan terhadap production tanpa persetujuan
    eksplisit.
-   Sediakan snapshot dan prosedur pemulihan untuk pengujian data nyata.

------------------------------------------------------------------------

## 17. Strategi pengujian berdasarkan lapisan

  -----------------------------------------------------------------------
  Lapisan                             Yang dibuktikan
  ----------------------------------- -----------------------------------
  Unit/domain                         Harga, denda, deposit, kelayakan,
                                      transisi status, capabilities,
                                      label status

  Integrasi service + PostgreSQL      Transaksi, constraint, pembayaran,
                                      pembatalan, snapshot, audit/outbox

  Kontrak API                         Bentuk respons, error, otorisasi,
                                      `PROFILE_INCOMPLETE`, `STALE_DATA`

  Keamanan                            Matriks role per rute, akses data
                                      milik pengguna, unggahan, injeksi,
                                      kebocoran realtime

  Konkurensi                          20 booking paralel pada slot sama;
                                      booking vs servis; pembatalan vs
                                      pembayaran; serah-terima ganda;
                                      admin terakhir

  E2E Playwright                      Siklus lengkap dari pelanggan baru
                                      sampai pengembalian/deposit,
                                      seluruh matriks pembatalan, metode
                                      pembayaran MVP

  Realtime                            Dua browser, perubahan tanpa
                                      reload, putus/sambung jaringan,
                                      backend restart, replay event

  GPS                                 Posisi invalid/duplikat/terbalik,
                                      geofence, offline, gerak tanpa
                                      sewa, izin dan retensi

  Integritas data                     `db:verify`/pemeriksaan invarian,
                                      database kosong, seed production
                                      guard

  Performa                            10.000 booking sintetis, p95
                                      endpoint utama ≤ 300 ms

  Aksesibilitas                       axe-core pada halaman utama, tanpa
                                      pelanggaran serius
  -----------------------------------------------------------------------

Gerbang rilis dari PRD tetap berlaku: tes otomatis hijau dua kali
berturut-turut, 16 cacat D-01 sampai D-16 lulus, cakupan service minimal
85%, uji konkurensi diulang lima kali, nol pelanggaran keamanan, dan nol
cacat kritis/tinggi terbuka.

Jangan mengklaim suatu tes telah lulus sebelum benar-benar dijalankan.
Gunakan PostgreSQL nyata untuk pengujian constraint/konkurensi; mock
database tidak membuktikan perlindungan konkurensi PostgreSQL.

------------------------------------------------------------------------

## 18. Keputusan terbuka dan batas asumsi

Bagian ini mencegah arsitektur terlihat lebih pasti daripada PRD.

  --------------------------------------------------------------------------
  Keputusan               Status menurut PRD      Perlakuan arsitektur
  ----------------------- ----------------------- --------------------------
  Pembayaran MVP:         Perlu konfirmasi        Implementasikan sesuai
  transfer, QRIS,                                 persetujuan pemilik;
  e-wallet manual, tunai                          jangan integrasikan
                                                  gateway nyata di Rilis 1

  Nilai deposit per motor Diisi pemilik saat      Simpan sebagai data
                          input armada; nilai     armada/pengaturan yang
                          aktual belum ditentukan tervalidasi; jangan
                                                  hardcode nilai global

  Batas tunggu            Perlu konfirmasi        Jadikan pengaturan; nilai
  tunai/no-show 3 jam                             awal bukan keputusan final

  Refund no-show          Perlu konfirmasi        Jangan menambahkan
                                                  perilaku refund di luar
                                                  keputusan pemilik dan PRD

  Batas booking tunai dan Perlu konfirmasi        Dapat dikonfigurasi;
  pembatalan per 30 hari                          jangan mengunci nilai
                                                  sebagai kebijakan permanen

  Selfie memegang KTP     Perlu konfirmasi        Hormati pengaturan yang
  wajib                                           disepakati; default awal
                                                  PRD aktif

  Usia minimum 18 tahun   Perlu konfirmasi        Simpan sebagai pengaturan;
                                                  nilai awal PRD

  Retensi lokasi GPS 90   Perlu konfirmasi        Implementasikan retensi
  hari                                            berbasis konfigurasi,
                                                  dengan audit pembersihan

  Denda keterlambatan:    Perlu konfirmasi        Nilai awal yang dapat
  toleransi 2 jam dan 10%                         dikonfigurasi; aturan
  per jam                                         harus konsisten dan
                                                  tersnapshot

  Perangkat GPS dan       Belum dipilih           Gunakan adapter; jangan
  penyedia email                                  mengarang vendor

  Library, struktur       Tidak ditetapkan PRD    Periksa
  folder, scheduler,                              repository/infrastruktur
  object storage, hosting                         sebelum memilih
  --------------------------------------------------------------------------

Apabila keputusan terbuka memengaruhi implementasi atau pengujian, catat
pertanyaan yang spesifik, pilihan yang diperlukan, dan dampaknya. Jangan
menghentikan seluruh pekerjaan yang tidak terkait; lanjutkan hanya pada
bagian yang tidak bergantung pada keputusan tersebut.

------------------------------------------------------------------------

## 19. Keterlacakan PRD ke arsitektur

  ---------------------------------------------------------------------------
  Area PRD                Bagian arsitektur       Bukti implementasi yang
                                                  diharapkan
  ----------------------- ----------------------- ---------------------------
  D-01, FR-ID-01/03,      5, 6, 8, 10             Booking tanpa profil
  FR-BKG-02                                       lengkap ditolak di semua
                                                  jalur

  D-02, FR-ID-05          6, 7, 9                 Satu fungsi status dokumen
                                                  untuk server dan UI

  D-03, FR-OPS-01,        6, 8, 12                Serah-terima punya alasan
  FR-ID-10                                        blokir; admin upload tidak
                                                  melewati verifikasi

  D-04, FR-ID-04,         7, 8                    Snapshot penyewa identik di
  FR-BKG-02                                       pelanggan dan admin

  D-05, FR-ID-06          5, 6, 10                Tidak ada data default
                                                  karangan; field kosong
                                                  jelas

  D-06, FR-PAY-02/03/04   7, 8, 10                Satu baris pembayaran
                                                  pending; metode pilihan dan
                                                  konfirmasi tersimpan

  D-07, FR-CAN-01--06     8, 9                    Matriks pembatalan
                                                  ditegakkan di API dan E2E

  D-08, FR-UX-01          5, 10                   Label dan pesan pengguna
                                                  dalam Bahasa Indonesia

  D-09, FR-UX-02,         5, 10, 11               Tab dan hitungan berasal
  FR-RT-05                                        dari pengelompokan server

  D-10, FR-BKG-04,        7, 8                    Tiga baris harga konsisten;
  FR-PAY-05                                       aturan deposit konsisten

  D-11, FR-RT-01--04      8, 11                   Outbox/SSE, isolasi event,
                                                  reconnect, `version`

  D-12, FR-UX-03          5, 8, 10                Aksi idempotent dan satu
                                                  toast per kegagalan

  D-13, FR-DATA-01,       12, 16                  Seed terjaga; role
  FR-ADM-01                                       server-side; database
                                                  bersih dapat diverifikasi

  D-14, FR-ADM-03         6, 7                    Ulasan hanya
                                                  disembunyikan/ditampilkan
                                                  bila modul tersebut ada

  D-15, FR-AST-03         6, 14                   Status servis dihitung
                                                  server menurut tanggal WIB

  D-16, FR-OPS-02         8, 9                    Checklist serah-terima
                                                  kosong secara default
  ---------------------------------------------------------------------------

------------------------------------------------------------------------

## 20. Checklist sebelum menganggap arsitektur diterapkan

Dokumen ini menjelaskan arsitektur yang dituju; keberadaan dokumen tidak
membuktikan implementasi sudah sesuai. Sebelum rilis, verifikasi:

-   [ ] Struktur repository dan dependensi nyata sudah dipetakan.
-   [ ] Semua endpoint dan role sudah memiliki pemeriksaan otorisasi
    server.
-   [ ] Aturan booking, pembayaran, pembatalan, serah-terima, dan
    pengembalian berada di service/domain yang konsisten.
-   [ ] PostgreSQL mencegah double booking dan konflik servis dalam
    kondisi paralel.
-   [ ] Snapshot booking dan persetujuan tersimpan.
-   [ ] Dokumen dan foto privat serta setiap akses yang diwajibkan
    diaudit.
-   [ ] Audit dan outbox ditulis secara atomik bersama mutasi.
-   [ ] Event SSE tidak memuat data pribadi dan tidak bocor lintas
    pengguna.
-   [ ] `version` dan penanganan `STALE_DATA` berjalan.
-   [ ] Pengaturan terbuka tidak di-hardcode sebagai keputusan final.
-   [ ] Seed menolak production; data mock tidak masuk ke jalur
    produksi.
-   [ ] `db:verify`/pemeriksaan invarian dan backup/restore telah diuji.
-   [ ] Semua gerbang pengujian PRD lulus dengan bukti.
-   [ ] Syarat Sewa dan Kebijakan Privasi final dan telah ditinjau
    sesuai PRD.

**Prinsip penutup:** arsitektur dianggap benar hanya jika aturan bisnis
dapat ditelusuri dari PRD ke domain service, database, API, UI,
audit/realtime, dan tes. Jangan menganggap keberadaan komponen atau
endpoint sudah membuktikan aturan tersebut ditegakkan.
