# DESIGN.md --- RodaKita

**Dokumen desain pengalaman pengguna (UX), antarmuka (UI), dan pola
interaksi**\
**Basis:** PRD & MVP RodaKita v2.0 (25 Oktober 2026), `AGENTS.md`, dan
`ARCHITECTURE.md`\
**Status:** Baseline desain untuk Rilis 1 / MVP\
**Bahasa antarmuka:** Bahasa Indonesia\
**Prinsip utama:** jelas, konsisten, aman, dan tidak membuat UI menjadi
sumber aturan bisnis.

------------------------------------------------------------------------

## 1. Tujuan dan batas dokumen

Dokumen ini menetapkan bagaimana pengguna menemukan informasi,
menyelesaikan tugas, memahami status, dan pulih dari kesalahan. Dokumen
ini melengkapi, bukan menggantikan, dokumen sumber:

1.  **PRD & MVP** adalah sumber kebenaran kebutuhan produk dan aturan
    bisnis.
2.  **AGENTS.md** adalah instruksi implementasi dan larangan
    penyimpangan.
3.  **ARCHITECTURE.md** menetapkan batas sistem, tanggung jawab lapisan,
    dan kontrak teknis.
4.  **DESIGN.md** menetapkan pola UX/UI yang konsisten dengan ketiganya.

Jika ada konflik, ikuti urutan di atas. Jangan mengubah kebijakan
booking, pembayaran, pembatalan, dokumen, GPS, atau izin hanya demi
membuat tampilan terlihat lebih sederhana.

### 1.1 Label kepastian

-   **\[WAJIB---SUMBER\]**: perilaku yang dinyatakan dalam PRD, AGENTS,
    atau ARCHITECTURE.
-   **\[REKOMENDASI UX\]**: pilihan presentasi/interaksi yang disarankan
    untuk membuat produk mudah dipakai; tidak mengubah aturan bisnis.
-   **\[PERLU KONFIRMASI\]**: keputusan bisnis yang ditandai terbuka di
    dokumen sumber. Jangan menutupnya melalui desain visual atau kode
    tanpa persetujuan.

### 1.2 Target pengalaman

-   Pengguna memahami harga, status, langkah berikutnya, dan alasan
    suatu aksi tidak tersedia.
-   Pengguna dengan profil lengkap dapat menyelesaikan alur booking
    sampai pembayaran dalam kurang dari 3 menit sesuai target PRD.
-   Pelanggan dan staf melihat fakta yang sama, menggunakan label status
    yang sama, dan menerima pembaruan realtime.
-   Tidak ada tindakan penting yang tampak berhasil sebelum server
    mengonfirmasi keberhasilannya.
-   Formulir panjang dibagi menjadi langkah yang jelas, tetapi tidak
    meminta ulang data yang sudah menjadi sumber utama di profil.

------------------------------------------------------------------------

## 2. Pengguna dan tugas utama

### 2.1 Pelanggan

**Kebutuhan:** menemukan motor yang tersedia, memahami biaya,
menyelesaikan persyaratan identitas, memesan, membayar, dan memantau
status.

Tugas utama: 1. Membuat akun dan memverifikasi email. 2. Melengkapi
profil penyewa dan mengunggah dokumen. 3. Menelusuri katalog, memilih
tanggal, memeriksa kalender ketersediaan, lalu membuka detail motor. 4.
Membuat booking dan membaca rincian biaya. 5. Menyelesaikan pembayaran
manual sesuai metode yang tersedia. 6. Memantau status, melihat
invoice/kwitansi, dan membatalkan hanya ketika kebijakan mengizinkan. 7.
Melihat riwayat sewa dan pemberitahuan yang relevan.

### 2.2 Staf operasional

**Kebutuhan:** menyelesaikan verifikasi, pembayaran manual,
serah-terima, pengembalian, booking walk-in/WhatsApp, dan penanganan
no-show dengan cepat dan dapat diaudit.

Tugas utama: 1. Meninjau dokumen dan memberikan keputusan dengan alasan.
2. Menemukan booking berdasarkan kode, status, atau data yang diizinkan.
3. Mengonfirmasi pembayaran manual. 4. Melakukan serah-terima dengan
checklist dan foto kondisi. 5. Mencatat pengembalian, foto kondisi,
odometer, denda/potongan sesuai kebijakan, dan penyelesaian deposit. 6.
Mengelola jadwal servis dan memantau GPS sesuai izin.

### 2.3 Admin

Admin memiliki tugas staf ditambah pengelolaan armada, pengguna/peran,
pengaturan, laporan, audit, dan keputusan khusus seperti pembatalan
booking berbayar serta keputusan refund. UI harus menyembunyikan atau
menonaktifkan aksi berdasarkan kemampuan dari server; menyembunyikan
tombol bukan pengganti otorisasi server.

------------------------------------------------------------------------

## 3. Prinsip desain UX yang tidak boleh dilanggar

1.  **Satu sumber kebenaran.** Nama, kontak, status dokumen, status
    booking, metode pembayaran, harga snapshot, dan status operasional
    berasal dari API/domain yang sama. Jangan menyusun versi berbeda
    khusus untuk kartu pelanggan atau panel admin.
2.  **Jelaskan langkah berikutnya.** Setiap status harus menjawab: "Apa
    yang terjadi?", "Apa yang perlu saya lakukan?", dan "Kapan saya bisa
    melakukan tindakan berikutnya?" bila informasi tersebut tersedia.
3.  **Alasan sebelum jalan buntu.** Tombol yang tidak dapat digunakan
    harus disertai alasan dari server dan, jika ada, jalur pemulihan
    yang sah.
4.  **Jangan meminta data dua kali.** Identitas dan kontak penyewa
    berasal dari profil. Saat booking, tampilkan ringkasan/snapshot
    untuk dikonfirmasi, bukan formulir identitas kedua.
5.  **Harga transparan.** Tampilkan Total sewa, Deposit, dan Total yang
    dibayar sebagai tiga baris terpisah pada detail booking, konfirmasi,
    pembayaran, dan dokumen keuangan.
6.  **Status internal tidak ditampilkan mentah.** Enum/kode API
    dipetakan ke label Bahasa Indonesia bersama; jangan tampilkan
    `pending`, `needs_refund`, `STALE_DATA`, atau kode internal sebagai
    pesan untuk pengguna.
7.  **Tidak ada data palsu.** Data kosong tampil sebagai "Belum diisi"
    atau keadaan kosong yang jelas. Jangan memakai kontak contoh, status
    buatan, kode booking palsu, atau angka ringkasan statis di produksi.
8.  **Aksi sensitif punya konfirmasi yang proporsional.** Konfirmasi
    untuk membatalkan tindakan penting, menyetujui pembayaran,
    serah-terima, pengembalian, atau keputusan admin; jangan menambah
    dialog konfirmasi untuk setiap navigasi sederhana.
9.  **Tahan klik ganda.** Setelah aksi dikirim, tombol masuk status
    memproses dan tidak bisa dikirim berulang. Backend tetap harus
    idempoten.
10. **Realtime bukan sumber kebenaran.** Event memberi tahu bahwa data
    berubah; klien mengambil data terbaru lewat API. Tampilkan indikator
    koneksi bila realtime terganggu.
11. **Privasi berdasarkan peran.** Pelanggan tidak melihat peta,
    koordinat, atau riwayat rute GPS. Dokumen identitas hanya dapat
    dibuka oleh staf/admin yang berwenang; setiap akses diaudit.
12. **Responsif dan aksesibel.** Alur penting dapat dipakai pada ponsel
    maupun desktop, dengan fokus keyboard, label form, kontras memadai,
    dan pesan error yang dapat dibaca teknologi bantu.

------------------------------------------------------------------------

## 4. Arsitektur informasi (IA) dan navigasi

### 4.1 Area publik dan pelanggan

Navigasi publik yang disarankan: - **Beranda** - **Cari Motor** - **Cara
Sewa** - **Masuk / Daftar**

Setelah login, navigasi pelanggan: - **Beranda / Cari Motor** -
**Booking Saya** - **Profil & Dokumen** - **Pesan / Bantuan** (jika
modul pesan kontak tersedia dalam implementasi) - **Akun**

Jangan menampilkan tautan yang mengarah ke fitur di luar Rilis 1,
seperti aplikasi native, perpanjangan sewa, add-on, promo, atau
pembayaran sebagian.

### 4.2 Panel staf/admin

Navigasi panel mengikuti izin server, bukan pilihan role di klien.
Kelompok menu yang disarankan:

-   **Ringkasan**
-   **Booking**
-   **Verifikasi Dokumen**
-   **Pembayaran**
-   **Operasional Sewa**
    -   Serah-terima
    -   Pengembalian
    -   No-show
-   **Armada**
    -   Daftar Motor
    -   Kalender Ketersediaan
    -   Jadwal Servis
-   **GPS & Peringatan**
-   **Pesan Kontak**
-   **Laporan**
-   **Pengguna & Peran** (admin)
-   **Pengaturan** (admin)
-   **Log Audit** (admin)

Menu boleh dikelompokkan berbeda jika pola repository yang ada lebih
sesuai, tetapi jangan menghilangkan kemampuan MVP atau memperluas izin.
Pengguna yang tidak berwenang tidak boleh memperoleh data hanya dengan
membuka URL langsung.

### 4.3 Navigasi dan konteks

-   Gunakan judul halaman yang spesifik, breadcrumb pada panel
    operasional yang dalam, dan penanda menu aktif.
-   Jangan membuat pengguna mengandalkan tombol browser Back untuk
    menyelesaikan proses multi-langkah.
-   Pertahankan filter dan konteks pencarian ketika pengguna kembali
    dari detail, sejauh aman dan sesuai pola aplikasi.
-   Pada detail booking, tampilkan kode booking, status, periode, motor,
    biaya, pembayaran, dokumen terkait, timeline, dan aksi yang saat itu
    diizinkan.
-   Jangan mencampur aksi admin yang berisiko tinggi dengan tombol
    primer pelanggan.

------------------------------------------------------------------------

## 5. Peta layar Rilis 1

  --------------------------------------------------------------------------
  ID                Layar             Pengguna           Tujuan utama
  ----------------- ----------------- ------------------ -------------------
  PUB-01            Beranda           Publik/pelanggan   Memulai pencarian
                                                         motor

  PUB-02            Katalog & hasil   Publik/pelanggan   Menyaring motor dan
                    pencarian                            memilih unit yang
                                                         sesuai

  PUB-03            Detail motor      Publik/pelanggan   Memahami
                                                         spesifikasi, harga,
                                                         dan ketersediaan

  AUTH-01           Daftar            Publik             Membuat akun

  AUTH-02           Masuk             Semua pengguna     Mengakses akun
                                                         sesuai izin

  AUTH-03           Verifikasi email  Pelanggan          Menyelesaikan akses
                    / lupa sandi                         akun

  CUS-01            Profil penyewa    Pelanggan          Melengkapi
                                                         identitas dan
                                                         kontak

  CUS-02            Dokumen & status  Pelanggan          Unggah, perbaiki,
                    verifikasi                           dan pantau dokumen

  BKG-01            Pemilihan tanggal Pelanggan          Memilih rentang
                                                         sewa yang tersedia

  BKG-02            Review booking    Pelanggan          Memeriksa motor,
                                                         periode, snapshot,
                                                         biaya, dan syarat

  BKG-03            Pembayaran        Pelanggan          Melakukan instruksi
                                                         pembayaran manual

  CUS-03            Booking Saya      Pelanggan          Menemukan booking
                                                         berdasarkan status
                                                         yang konsisten

  CUS-04            Detail booking    Pelanggan          Melihat status,
                                                         pembayaran,
                                                         invoice/kwitansi,
                                                         dan aksi

  OPS-01            Ringkasan         Staf/admin         Melihat pekerjaan
                    operasional                          yang perlu
                                                         ditangani

  OPS-02            Daftar/detail     Staf/admin         Menangani booking
                    booking                              sesuai izin

  OPS-03            Antrean           Staf/admin         Memeriksa dokumen
                    verifikasi                           dan mencatat
                    dokumen                              keputusan

  OPS-04            Konfirmasi        Staf/admin         Memverifikasi bukti
                    pembayaran                           pembayaran manual

  OPS-05            Serah-terima      Staf/admin         Checklist, foto,
                                                         odometer, dan
                                                         konfirmasi sah

  OPS-06            Pengembalian      Staf/admin         Mencatat kondisi,
                                                         keterlambatan, dan
                                                         penyelesaian

  FLEET-01          Daftar & editor   Admin              Mengelola data
                    motor                                armada

  FLEET-02          Kalender          Staf/admin         Melihat booking dan
                    armada/servis                        blok servis

  GPS-01            Peta & peringatan Staf/admin         Memantau posisi
                                                         simulator dan
                                                         peringatan

  ADM-01            Pengguna,         Admin              Mengelola fungsi
                    pengaturan,                          administratif
                    laporan, audit                       
  --------------------------------------------------------------------------

Nama layar adalah ID dokumentasi, bukan keharusan nama route atau
struktur folder.

------------------------------------------------------------------------

## 6. Alur pengguna utama

### 6.1 Cari motor → booking

1.  Pelanggan memilih tanggal ambil dan kembali.
2.  Katalog menampilkan motor yang tersedia berdasarkan hasil server
    untuk rentang itu.
3.  Pelanggan membuka detail motor, memeriksa harga harian, spesifikasi,
    foto, dan kalender.
4.  Pelanggan menekan **Sewa Sekarang**.
5.  Server memeriksa profil, status dokumen, persetujuan, tanggal,
    ketersediaan, dan aturan yang berlaku.
6.  Jika profil belum siap, UI mengarahkan ke daftar persyaratan yang
    belum terpenuhi, dengan tautan langsung ke bagian profil/dokumen.
    Jangan membuat booking parsial yang tampak sah.
7.  Jika lolos, tampilkan review booking dengan periode, snapshot data
    penyewa, harga, deposit, total dibayar, metode pembayaran, serta
    versi syarat yang akan disetujui.
8.  Pelanggan mengonfirmasi. Server membuat booking dan menahan slot
    secara atomik.
9.  UI menampilkan kode booking asli dari server dan status sesuai
    konteks.
10. Jika slot sudah diambil oleh permintaan lain, tampilkan konflik yang
    ramah, pertahankan pilihan tanggal bila masih valid, lalu minta
    pengguna memilih ulang. Jangan menampilkan keberhasilan palsu.

**\[WAJIB---SUMBER\]** Pemeriksaan UI hanya membantu pengguna; keputusan
final mengenai profil, harga, dan ketersediaan berasal dari
server/database.

### 6.2 Profil dan dokumen

1.  Tampilkan ringkasan kesiapan profil: **Siap untuk menyewa** atau
    **Perlu dilengkapi**.
2.  Kelompokkan isian menjadi Identitas, Kontak, Kontak Darurat,
    Dokumen, dan Persetujuan.
3.  Beri label wajib secara eksplisit dan jelaskan format yang
    diharapkan sebelum pengguna mengirim.
4.  Untuk file, tampilkan format dan batas ukuran yang benar: JPG/JPEG,
    PNG, WebP; maksimum 2 MB.
5.  Setiap dokumen menunjukkan status yang berasal dari server: Belum
    diunggah, Menunggu verifikasi, Terverifikasi, Ditolak, atau
    Kedaluwarsa.
6.  Jika ditolak, tampilkan alasan yang diberikan petugas dan aksi
    unggah ulang bila status mengizinkan.
7.  Jika dokumen berubah setelah diverifikasi, jangan tetap menampilkan
    status lama sebagai terverifikasi; tunggu status terbaru dari
    server.
8.  Tampilkan hanya empat digit terakhir nomor KTP. Jangan tampilkan
    dokumen privat pada URL publik atau thumbnail yang dapat diakses
    tanpa otorisasi.
9.  Persetujuan Syarat Sewa, Kebijakan Privasi, dan GPS harus jelas dan
    tercatat sesuai mekanisme server.

### 6.3 Pembayaran manual

1.  Pelanggan memilih metode yang memang diaktifkan oleh konfigurasi
    sistem.
2.  Tampilkan instruksi pembayaran dari konfigurasi/server; jangan
    hardcode nama bank, nomor rekening, penerima, atau metode.
3.  Tampilkan tiga baris biaya yang konsisten: Total sewa, Deposit,
    Total yang dibayar.
4.  Bila metode memerlukan bukti bayar, jelaskan format dan cara unggah
    berdasarkan dukungan aktual sistem.
5.  Setelah bukti dikirim, tampilkan **Menunggu verifikasi**, bukan
    **Lunas**.
6.  Hanya setelah server mengonfirmasi pembayaran, status berubah
    menjadi **Lunas** dan booking dapat menjadi **Dikonfirmasi** sesuai
    aturan.
7.  Bila pembayaran terlambat masuk setelah booking tidak lagi dapat
    dipenuhi, tampilkan status dan instruksi yang dikirim server; jangan
    menjanjikan refund otomatis.
8.  Jangan menampilkan tombol bayar berulang yang membuat transaksi
    baru; backend memastikan satu catatan pembayaran yang sesuai per
    booking dan operasi idempoten.

**\[PERLU KONFIRMASI\]** Daftar metode yang diaktifkan dan detail
operasionalnya harus mengikuti pengaturan serta keputusan pemilik. Rilis
1 tidak memakai payment gateway atau webhook pembayaran nyata.

### 6.4 Booking Saya dan pembatalan

Tab/kategori **Booking Saya** harus menggunakan pengelompokan status
yang sama dengan panel admin. Sekurang-kurangnya, pengguna harus dapat
menemukan booking **Menunggu pembayaran**, bukan hanya booking
terkonfirmasi.

  -----------------------------------------------------------------------
  Kondisi booking         Aksi pelanggan          Pesan/UX
  ----------------------- ----------------------- -----------------------
  Online, belum dibayar   Boleh batal             Jelaskan slot akan
  dan belum ada bukti                             dilepas setelah
  bayar                                           pembatalan berhasil

  Online, bukti bayar     Tidak boleh batal       Jelaskan perlu
  dikirim dan menunggu    sendiri                 menghubungi admin;
  verifikasi                                      jangan tampilkan tombol
                                                  batal aktif

  Online, sudah dibayar   Tidak boleh batal       Jelaskan
  dan dikonfirmasi        sendiri                 pembatalan/keputusan
                                                  refund hanya ditangani
                                                  admin

  Tunai, sebelum          Boleh batal             Jelaskan status akan
  serah-terima                                    diperbarui setelah
                                                  server mengonfirmasi

  Berjalan, selesai,      Tidak ada aksi batal    Jangan tampilkan tombol
  dibatalkan, kedaluwarsa                         yang seolah dapat
                                                  digunakan
  -----------------------------------------------------------------------

-   **\[WAJIB---SUMBER\]** Ikuti matriks pembatalan di PRD. UI tidak
    boleh memperluas hak pembatalan.
-   Sebelum pembatalan yang diizinkan, gunakan dialog singkat dengan
    kode booking, periode, dan konsekuensi yang benar-benar ditetapkan.
-   Setelah aksi, perbarui detail dan daftar berdasarkan respons server;
    hindari toast ganda.
-   Untuk aksi yang tidak diizinkan, tampilkan alasan dari
    `capabilities` API, bukan aturan lokal yang dikarang.

### 6.5 Serah-terima motor

1.  Petugas membuka booking yang tepat dan memeriksa identitas serta
    status yang diberikan server.
2.  Tampilkan daftar prasyarat yang belum terpenuhi; setiap penghalang
    memiliki alasan dan jalur pemulihan resmi.
3.  Checklist serah-terima harus **kosong secara default**. Jangan
    centang otomatis.
4.  Ambil foto kondisi minimal empat sisi dan odometer sesuai PRD.
5.  Pastikan rincian uang dan deposit sesuai alur pembayaran yang sah.
6.  Untuk tunai, gunakan satu aksi **Terima Tunai & Serah Terima**
    sesuai kontrak atomik sistem; jangan pecah menjadi tombol pembayaran
    dan aktivasi booking yang dapat berhasil sebagian.
7.  Untuk alur online, gunakan aksi serah-terima yang diizinkan server.
8.  Setelah server berhasil, tampilkan bukti serah-terima/timeline dan
    status **Berjalan**.
9.  Jika gagal, pertahankan data form yang aman, jelaskan penyebab yang
    dapat ditindaklanjuti, dan jangan mengubah status lokal seolah
    berhasil.

### 6.6 Pengembalian

1.  Petugas membuka booking berstatus **Berjalan**.
2.  Periksa dan catat foto kondisi minimal empat sisi serta odometer.
3.  Tampilkan jadwal kembali dan perhitungan keterlambatan yang berasal
    dari server.
4.  Tampilkan deposit, potongan, denda, biaya kerusakan/biaya lain jika
    berlaku, serta saldo akhir dengan istilah yang jelas.
5.  Deposit tidak ditampilkan sebagai pendapatan.
6.  Minta konfirmasi sebelum menyelesaikan pengembalian.
7.  Setelah transaksi berhasil, tampilkan status **Selesai**, ringkasan
    perhitungan, dan dokumen keuangan yang tersedia.
8.  Jika pengembalian gagal atau data stale, jangan menampilkan seolah
    transaksi selesai; refresh data terbaru dan minta petugas meninjau
    ulang.

**\[PERLU KONFIRMASI\]** Nilai awal toleransi/denda, keputusan
no-show/refund, dan beberapa parameter operasional tetap
konfigurabel/menunggu persetujuan sesuai PRD; jangan menjadikan angka
awal sebagai kebijakan permanen di UI copy.

------------------------------------------------------------------------

## 7. Pola status dan bahasa antarmuka

### 7.1 Label status booking

  -----------------------------------------------------------------------
  Status internal         Label yang terlihat     Konteks/petunjuk
  ----------------------- ----------------------- -----------------------
  `pending` online        Menunggu pembayaran     Jelaskan tindakan
                                                  pembayaran dan batas
                                                  waktu jika tersedia

  `pending` tunai         Menunggu serah-terima   Gunakan hanya bila
                                                  konteks tunai sudah
                                                  diketahui server

  `confirmed`             Dikonfirmasi            Pembayaran/konfirmasi
                                                  selesai; menunggu
                                                  pengambilan

  `active`                Berjalan                Motor sedang disewa

  `completed`             Selesai                 Tampilkan ringkasan
                                                  sewa

  `cancelled`             Dibatalkan              Tampilkan pelaku/alasan
                                                  jika memang diizinkan
                                                  dan tersedia

  `expired`               Kedaluwarsa             Tampilkan penyebab yang
                                                  disediakan server bila
                                                  tersedia
  -----------------------------------------------------------------------

`pending` tidak boleh dipetakan ke satu label generik untuk semua
metode; konteks pembayaran diperlukan agar pelanggan tahu tindakan
berikutnya.

### 7.2 Label status pembayaran

  Status internal   Label yang terlihat
  ----------------- ------------------------------------
  `pending`         Menunggu pembayaran
  `submitted`       Menunggu verifikasi pembayaran
  `paid`            Lunas
  `needs_refund`    Perlu penanganan pengembalian dana
  `refunded`        Dana dikembalikan
  `cancelled`       Pembayaran dibatalkan
  `expired`         Pembayaran kedaluwarsa

Untuk `needs_refund`, tampilkan keterangan dan langkah selanjutnya yang
diberikan server. Jangan menyebut dana "sedang dikembalikan" kecuali
proses tersebut benar-benar dimulai dan status server menyatakan
demikian.

### 7.3 Label status dokumen

  Status internal   Label yang terlihat
  ----------------- ---------------------
  `not_uploaded`    Belum diunggah
  `pending`         Menunggu verifikasi
  `verified`        Terverifikasi
  `rejected`        Ditolak
  `expired`         Kedaluwarsa

Status dokumen adalah status server. Jangan menyimpulkan dokumen
terverifikasi hanya karena file ada.

### 7.4 Pola timeline

-   Tampilkan waktu dengan format lokal Indonesia dan zona waktu WIB
    untuk jadwal bisnis.
-   Urutkan peristiwa secara kronologis dan bedakan waktu kejadian dari
    status saat ini.
-   Hanya tampilkan kejadian yang berasal dari sumber data yang
    benar-benar tersimpan.
-   Hindari mengarang entri timeline untuk mengisi ruang kosong.
-   Jika tidak ada riwayat, tampilkan "Belum ada aktivitas" dan
    instruksi yang relevan.

------------------------------------------------------------------------

## 8. Pola tata letak dan komponen

### 8.1 Katalog dan kartu motor

Kartu motor sebaiknya memuat: - Foto utama asli dari database. -
Nama/model motor yang tersimpan. - Harga harian. - Ringkasan spesifikasi
yang tersedia di data. - Status ketersediaan untuk tanggal pencarian
yang dipilih. - Aksi **Lihat Detail**.

Jangan menampilkan harga diskon, rating, ulasan, promo, add-on, atau
ketersediaan buatan jika fitur/data tersebut belum ada atau di luar
lingkup. Foto gagal dimuat harus memiliki fallback visual netral, bukan
foto motor lain yang menyesatkan.

### 8.2 Detail motor

Urutan konten yang disarankan: 1. Foto dan nama motor. 2. Harga harian
dan informasi spesifikasi yang tersedia. 3. Pemilih tanggal ambil dan
kembali. 4. Kalender ketersediaan yang berasal dari server. 5. Rincian
biaya untuk rentang tanggal yang dipilih bila server mendukung
perhitungan. 6. Tombol **Sewa Sekarang**. 7. Informasi persyaratan
dokumen dan ringkasan aturan yang relevan.

Tanggal kembali mengikuti semantik rentang `[ambil, kembali)`: tanggal
kembali bukan hari sewa tambahan untuk pengecekan konflik. Jangan
menandai slot tersedia berdasarkan hitungan frontend saja.

### 8.3 Rincian harga

Gunakan komponen bersama pada detail booking, review, pembayaran, admin,
invoice, dan kwitansi:

  -----------------------------------------------------------------------
  Baris                               Aturan presentasi
  ----------------------------------- -----------------------------------
  Total sewa                          Nilai snapshot dari server dalam
                                      Rupiah bulat

  Deposit                             Nilai deposit yang berlaku pada
                                      booking; bukan pendapatan

  **Total yang dibayar**              Total sewa + deposit sesuai aturan
                                      pembayaran
  -----------------------------------------------------------------------

-   Format Rupiah konsisten, misalnya `Rp 250.000`; sumber angka harus
    API.
-   Jangan hitung ulang total yang dapat mengakibatkan perbedaan
    antarhalaman.
-   Jika biaya/denda berubah saat pengembalian, tampilkan perhitungan
    pengembalian secara terpisah dari harga awal booking.
-   Jangan menampilkan angka nol sebagai pengganti nilai yang belum
    tersedia; gunakan keadaan "Belum ditentukan" atau pesan yang sesuai
    data sebenarnya.

### 8.4 Tabel admin

-   Kolom utama harus mendukung pemindaian cepat: kode booking, nama
    penyewa yang diizinkan, motor, periode, status, pembayaran, dan
    tindakan.
-   Sediakan pencarian dan filter hanya untuk field yang benar-benar
    didukung API.
-   Status ditampilkan sebagai label Indonesia, bukan enum mentah.
-   Jangan menggunakan kolom generik seperti "Unit" bila nama motor yang
    benar tersedia.
-   Aksi berisiko diletakkan konsisten pada detail atau menu tindakan,
    bukan dicampur dengan tautan navigasi.
-   Pertahankan filter/sort saat kembali dari detail jika tidak
    menyebabkan data usang.
-   Jangan menghapus data yang harus diaudit; untuk ulasan jika fitur
    tersebut ada, gunakan tampil/sembunyikan sesuai PRD, bukan
    penghapusan permanen.

### 8.5 Formulir

-   Label selalu terlihat; placeholder bukan pengganti label.
-   Validasi field di klien untuk umpan balik cepat, lalu validasi ulang
    di server.
-   Tampilkan error dekat field terkait, dengan ringkasan error di atas
    formulir bila ada beberapa kesalahan.
-   Pertahankan input non-sensitif saat validasi gagal; jangan menyimpan
    atau menampilkan ulang rahasia/dokumen sensitif secara tidak aman.
-   Jelaskan format sebelum submit (contoh: nomor WhatsApp format +62,
    file maksimal 2 MB).
-   Hindari reset formulir tanpa konfirmasi jika pengguna sudah
    memasukkan data.
-   Gunakan satu pesan/toast untuk satu kegagalan; jangan tampilkan
    toast dari komponen dan global handler secara bersamaan.

### 8.6 Dialog, toast, dan notifikasi

-   **Dialog**: tindakan yang berdampak penting atau tidak mudah
    dibatalkan.
-   **Toast**: hasil singkat yang tidak membutuhkan tindakan lanjutan.
-   **Pesan inline**: validasi field, status persisten, alasan aksi
    nonaktif.
-   **Banner**: gangguan koneksi, status layanan, atau peringatan yang
    tetap relevan.
-   Pesan sukses hanya setelah server memastikan operasi berhasil.
-   Pesan error harus memakai Bahasa Indonesia yang menjelaskan masalah
    dan langkah aman selanjutnya; jangan membocorkan stack trace, query,
    atau kode internal.
-   Jangan mengulang pesan yang sama di toast, banner, dan modal
    sekaligus.

------------------------------------------------------------------------

## 9. Pola loading, kosong, error, dan koneksi

Setiap layar data harus mempunyai empat keadaan yang dirancang secara
eksplisit.

### 9.1 Loading

-   Gunakan skeleton untuk struktur kartu/tabel yang sudah diketahui,
    atau indikator loading yang dekat dengan aksi.
-   Hindari mengganti seluruh halaman menjadi kosong saat refresh data
    kecil.
-   Aksi yang sedang dikirim menampilkan status proses dan mencegah
    submit ulang.

### 9.2 Empty state

-   Katalog tanpa hasil: jelaskan tidak ada motor untuk kriteria/tanggal
    tersebut dan sediakan cara mengubah tanggal/filter.
-   Booking Saya kosong: jelaskan belum ada booking dan tautan ke
    katalog.
-   Antrean verifikasi kosong: tampilkan "Tidak ada dokumen yang
    menunggu verifikasi".
-   Tidak ada data GPS: jelaskan belum ada posisi yang diterima; jangan
    menggambar posisi palsu.
-   Field profil kosong: tampilkan "Belum diisi", bukan contoh
    realistis.
-   Empty state tidak boleh menyiratkan bahwa suatu tindakan berhasil
    atau data sudah tersedia.

### 9.3 Error state

-   Bedakan masalah validasi, tidak berizin, data tidak ditemukan,
    konflik ketersediaan, data usang, dan gangguan server.
-   `409 STALE_DATA`: muat ulang data terbaru, beri tahu pengguna bahwa
    data berubah, dan jangan mengulang mutasi lama otomatis tanpa
    konfirmasi.
-   Konflik slot: minta pengguna memeriksa ketersediaan terbaru.
-   `403`: jelaskan prasyarat/izin yang tidak terpenuhi tanpa
    membocorkan informasi sensitif.
-   Gangguan jaringan: jangan mengganti respons gagal dengan data mock.
-   Sediakan tombol **Coba Lagi** bila aman; aksi
    pembayaran/serah-terima/pengembalian harus aman terhadap pengiriman
    ulang.

### 9.4 Realtime dan status koneksi

-   Tampilkan indikator ringkas: **Tersambung**, **Menyambungkan
    kembali**, atau **Pembaruan tertunda**.
-   Ketika SSE tersambung kembali, refresh data terbaru melalui API
    sebelum menganggap UI sinkron.
-   Jika memakai polling cadangan, jangan menyatakan realtime aktif jika
    stream sebenarnya terputus.
-   Event SSE tidak boleh membawa data pribadi; setelah menerima event,
    ambil data dengan API dan otorisasi biasa.
-   Jika pembaruan tertunda, tampilkan waktu pembaruan terakhir bila
    relevan dan hindari aksi yang bergantung pada data usang.

------------------------------------------------------------------------

## 10. Kemampuan aksi dan disabled state

API mengirim `capabilities` beserta alasan dalam Bahasa Indonesia. UI
memakainya untuk menentukan tampilan aksi. Nama capability di bawah
merupakan ilustrasi konsep, bukan kontrak nama final jika API proyek
sudah menetapkannya.

  ------------------------------------------------------------------------
  Aksi                    Tampilan bila diizinkan Tampilan bila tidak
                                                  diizinkan
  ----------------------- ----------------------- ------------------------
  Membuat booking         Tombol aktif            Jelaskan
                                                  profil/dokumen/tanggal
                                                  yang belum memenuhi
                                                  syarat

  Membayar                Tombol aktif dengan     Tampilkan status dan
                          metode yang tersedia    alasan dari server

  Membatalkan booking     Tombol batal sesuai     Tombol tidak aktif/tidak
                          matriks                 ditampilkan dengan
                                                  alasan yang jelas

  Verifikasi dokumen      Aksi sesuai izin        Tidak tersedia bagi
                          staf/admin              pelanggan

  Konfirmasi pembayaran   Aksi sesuai izin dan    Tampilkan status yang
                          status                  menghalangi

  Serah-terima            Aktif jika prasyarat    Daftar penghalang dan
                          server terpenuhi        jalur pemulihan resmi

  Pengembalian            Aktif untuk booking     Alasan/status yang
                          berjalan dan izin yang  menghalangi
                          sesuai                  

  Mengubah                Admin sesuai izin       Tidak tersedia bagi
  armada/pengaturan                               staf/pelanggan bila
                                                  tidak diizinkan
  ------------------------------------------------------------------------

Jangan hanya mengandalkan disabled button yang tidak menjelaskan
apa-apa. Pada aksi penting, alasan harus terlihat dekat dengan tombol.
Server tetap memvalidasi setiap permintaan.

------------------------------------------------------------------------

## 11. Sistem visual

Bagian ini merupakan **rekomendasi presentasi**, bukan ketentuan merek
yang sudah ditetapkan oleh PRD. Sesuaikan dengan sistem desain yang
sudah ada di repository jika tersedia.

### 11.1 Arah visual

-   **Karakter:** tepercaya, praktis, tenang, mudah dipindai.
-   **Prioritas:** informasi status dan biaya lebih penting daripada
    dekorasi.
-   **Gaya:** layout bersih, hirarki judul jelas, kartu sederhana,
    border halus, ruang kosong cukup, ikon hanya bila membantu
    pemahaman.
-   **Hindari:** animasi dekoratif berlebihan, gradien mencolok yang
    mengurangi keterbacaan, badge status yang hanya dibedakan dengan
    warna, serta dashboard penuh grafik yang tidak membantu tugas
    operasional.

### 11.2 Token awal yang disarankan

Nilai berikut adalah titik awal visual yang boleh diselaraskan dengan
implementasi existing; bukan aturan bisnis.

  Token                   Nilai awal         Penggunaan
  ----------------------- ------------------ ---------------------------------
  `color.primary`         `#176B5B`          Aksi utama dan elemen identitas
  `color.primary-hover`   `#125548`          Hover/fokus aksi utama
  `color.text`            `#18212B`          Teks utama
  `color.text-muted`      `#5B6573`          Teks pendukung
  `color.surface`         `#FFFFFF`          Kartu dan panel
  `color.page`            `#F6F8F7`          Latar halaman
  `color.border`          `#DCE3E0`          Garis pemisah
  `color.success`         `#16794B`          Status berhasil
  `color.warning`         `#946200`          Perlu perhatian
  `color.danger`          `#B42318`          Error/tindakan berisiko
  `radius.card`           `12px`             Kartu
  `radius.control`        `8px`              Input/tombol
  `space.base`            `4px`              Skala dasar jarak
  `content.max-width`     `1200px`           Lebar konten desktop
  `focus.ring`            outline terlihat   Fokus keyboard

Pastikan kombinasi warna dan teks memenuhi kontras WCAG 2.1 AA. Jangan
menggunakan warna sebagai satu-satunya pembeda status; sertakan label
teks dan, bila perlu, ikon.

### 11.3 Tipografi dan jarak

-   Gunakan font sans-serif yang sudah tersedia di proyek; jangan
    menambahkan dependency font tanpa alasan.
-   Gunakan ukuran teks isi yang nyaman dibaca dan hirarki konsisten
    untuk judul halaman, section, label, dan metadata.
-   Gunakan skala jarak konsisten berbasis kelipatan 4 px.
-   Hindari paragraf panjang pada panel operasional; utamakan ringkasan
    dan detail yang dapat dibuka saat diperlukan.
-   Nomor booking, tanggal, harga, dan status harus mudah dipindai.

### 11.4 Status badge

-   Badge selalu memiliki label teks.
-   Gunakan warna status konsisten di semua layar.
-   Jangan menyamakan "Menunggu verifikasi pembayaran" dengan "Lunas".
-   Jangan menyamakan "Terverifikasi" dengan "File diunggah".
-   Warna hanyalah petunjuk; label teks tetap sumber informasi utama.

------------------------------------------------------------------------

## 12. Responsif dan aksesibilitas

### 12.1 Perilaku responsif

-   **Ponsel:** satu kolom; tombol utama mudah dijangkau; tabel admin
    berubah menjadi daftar ringkas atau tabel dengan scroll horizontal
    yang jelas; formulir tidak mengharuskan zoom.
-   **Tablet:** dua kolom hanya jika konten tetap terbaca; panel
    operasional tetap mengutamakan tindakan utama.
-   **Desktop:** katalog grid sesuai lebar; panel admin dapat memakai
    sidebar dan tabel.
-   Hindari menyembunyikan informasi penting di layar kecil. Kode
    booking, status, periode, total biaya, dan alasan tindakan nonaktif
    harus tetap mudah ditemukan.
-   Dialog harus muat di viewport kecil, dapat discroll, dan tombol aksi
    tidak terpotong.

### 12.2 Aksesibilitas minimum

-   Semua input punya label yang terhubung secara programatis.
-   Semua aksi dapat diakses keyboard; fokus terlihat dan urutan fokus
    masuk akal.
-   Gunakan heading secara hierarkis; jangan memilih heading hanya demi
    ukuran visual.
-   Error form ditautkan ke field terkait dan diumumkan dengan benar
    kepada pembaca layar.
-   Jangan mengandalkan warna saja.
-   Gambar informatif punya teks alternatif; gambar dekoratif tidak
    menambah noise aksesibilitas.
-   Tombol memiliki nama yang jelas, bukan hanya ikon tanpa
    label/accessible name.
-   Status realtime penting diumumkan secara wajar, tanpa membanjiri
    pembaca layar.
-   Hormati preferensi pengurangan gerakan jika animasi digunakan.

------------------------------------------------------------------------

## 13. Privasi dan keamanan yang terlihat di UI

-   Nomor KTP hanya menampilkan empat digit terakhir sesuai PRD.
-   Dokumen KTP, SIM, dan selfie hanya dapat dilihat staf/admin
    berwenang melalui akses privat yang diaudit.
-   Jangan menyimpan URL dokumen privat ke local storage, query string,
    analitik, atau pesan error.
-   Jangan menampilkan koordinat, peta, dan riwayat rute kepada
    pelanggan. Untuk pelanggan, cukup tampilkan pemberitahuan bahwa
    motor dilengkapi GPS sesuai persetujuan.
-   UI tidak menyediakan kontrol mematikan mesin jarak jauh.
-   Role pengguna ditentukan server; jangan menyediakan switch role di
    UI.
-   Jangan mengungkap keberadaan data sensitif milik akun lain lewat
    pesan error.
-   Dialog persetujuan harus menjelaskan apa yang disetujui dan
    versinya, sesuai isi dokumen legal yang disahkan; jangan menulis
    klaim legal baru di UI.
-   Jangan menyimpan bukti bayar/dokumen secara lokal di browser lebih
    lama dari kebutuhan proses.
-   Log dan pesan antarmuka tidak boleh memuat nomor KTP penuh, token,
    kredensial, atau stack trace.

------------------------------------------------------------------------

## 14. Email dan notifikasi transaksional

Email yang tercantum di PRD harus menggunakan template berbahasa
Indonesia, dengan istilah yang sama seperti UI. Minimal, template yang
diperlukan mengikuti peristiwa yang benar-benar didukung: verifikasi
email, reset sandi, status dokumen, status booking/pembayaran,
pembatalan, dan pengingat yang ditetapkan PRD.

Setiap email sebaiknya memuat: - Tujuan email di judul. - Ringkasan
status terkini yang bersumber dari server. - Kode booking jika terkait
booking. - Aksi berikutnya yang sah dan tautan kembali ke aplikasi. -
Informasi kontak bantuan yang benar-benar dikonfigurasi.

Jangan mengklaim email telah terkirim jika provider gagal. Kegagalan
email tidak boleh membuat status booking/pembayaran berpura-pura sukses.
Jangan menambahkan notifikasi WhatsApp pada Rilis 1.

------------------------------------------------------------------------

## 15. Copywriting dan contoh pesan

Gunakan Bahasa Indonesia yang lugas, spesifik, dan tidak menyalahkan
pengguna. Pesan final harus disesuaikan dengan alasan yang benar-benar
dikirim API.

  -----------------------------------------------------------------------
  Situasi                             Pola copy yang disarankan
  ----------------------------------- -----------------------------------
  Profil belum lengkap                "Lengkapi profil dan dokumen yang
                                      diperlukan sebelum membuat
                                      booking."

  Dokumen menunggu                    "Dokumen Anda sedang menunggu
                                      verifikasi."

  Dokumen ditolak                     "Dokumen belum dapat diverifikasi.
                                      Periksa alasan di bawah, lalu
                                      unggah ulang jika tersedia."

  Tidak tersedia                      "Motor tidak tersedia untuk rentang
                                      tanggal ini. Pilih tanggal lain
                                      atau periksa motor lain."

  Data berubah                        "Data telah berubah sejak halaman
                                      ini dibuka. Kami memuat informasi
                                      terbaru agar tindakan Anda tetap
                                      akurat."

  Aksi tidak diizinkan                "Aksi ini belum dapat dilakukan.
                                      Lihat alasan dan langkah berikutnya
                                      di bawah."

  Gangguan jaringan                   "Koneksi terputus. Periksa koneksi
                                      Anda lalu coba lagi."

  Berhasil membuat booking            "Booking berhasil dibuat." (hanya
                                      setelah server mengonfirmasi)

  Bukti pembayaran dikirim            "Bukti pembayaran terkirim dan
                                      menunggu verifikasi."

  Pembayaran dikonfirmasi             "Pembayaran telah dikonfirmasi."
                                      (hanya saat status server `paid`)

  Tidak ada data                      "Belum ada data untuk ditampilkan."

  Belum diisi                         "Belum diisi"
  -----------------------------------------------------------------------

Hindari pesan seperti "Terjadi kesalahan" tanpa penjelasan, "Pasti
berhasil", atau kode teknis mentah. Jangan menjanjikan waktu verifikasi,
refund, atau ketersediaan kecuali informasi tersebut ditetapkan dan
dapat dipercaya.

------------------------------------------------------------------------

## 16. Desain layar admin untuk efisiensi operasional

### 16.1 Ringkasan operasional

Tampilkan hanya metrik dan antrean yang berasal dari data aktual API,
misalnya booking yang menunggu tindakan, dokumen yang menunggu
verifikasi, pembayaran yang menunggu verifikasi, dan sewa yang sedang
berjalan---sepanjang endpoint dan izin mendukungnya.

-   Angka ringkasan harus cocok dengan daftar setelah filter yang sama
    diterapkan.
-   Klik kartu ringkasan membawa pengguna ke daftar yang sudah difilter.
-   Jangan menampilkan data contoh saat API kosong atau gagal.
-   Jangan membuat grafik dekoratif tanpa keputusan operasional yang
    dibantu.

### 16.2 Antrean dokumen

-   Tampilkan identitas minimum yang diperlukan untuk memilih kasus.
-   Detail dokumen dibuka melalui akses privat dan dicatat.
-   Keputusan verifikasi harus menyertakan alasan jika ditolak sesuai
    kontrak produk.
-   Setelah keputusan, refresh status server dan hilangkan item dari
    antrean sesuai status terbaru.
-   Jangan tampilkan "Terverifikasi" berdasarkan keberadaan file saja.

### 16.3 Antrean pembayaran

-   Tampilkan kode booking, metode pembayaran yang dipilih pelanggan,
    jumlah, waktu pengiriman bukti, dan status.
-   Jangan hardcode metode atau nama bank.
-   Konfirmasi pembayaran harus idempoten; klik ganda tidak boleh
    menggandakan catatan pembayaran.
-   Jika data berubah sejak dibuka, minta refresh dan tinjau ulang
    sebelum konfirmasi.

### 16.4 Serah-terima dan pengembalian

-   Satu halaman harus memusatkan data booking, status dokumen,
    checklist, foto, odometer, pembayaran, dan tindakan yang diizinkan.
-   Tampilkan prasyarat yang belum terpenuhi di bagian atas.
-   Checklist selalu kosong sebelum petugas memeriksa kondisi secara
    nyata.
-   Foto yang dibutuhkan tidak boleh dianggap tersedia sebelum upload
    berhasil dikonfirmasi server.
-   Setelah transaksi berhasil, kunci tindakan yang tidak lagi sah dan
    tampilkan bukti/timeline yang tersimpan.

### 16.5 Armada dan servis

-   Nama/model motor dan foto berasal dari data armada.
-   Status servis dihitung server dari tanggal dan status aktual, bukan
    label yang disimpan secara manual bila aturan PRD menetapkan
    perhitungan.
-   Kalender membedakan booking dan blok servis dengan label/legenda
    yang dapat dipahami, bukan warna saja.
-   Setiap perubahan yang memengaruhi ketersediaan harus memperbarui
    kalender melalui data terbaru/realtime.
-   Konflik booking-servis harus ditolak oleh server/database dan
    dijelaskan kepada staf.

### 16.6 GPS

-   Hanya staf/admin yang berwenang dapat membuka peta, riwayat, dan
    peringatan.
-   Tampilkan waktu posisi terakhir dan status sinyal jika data
    tersedia.
-   Bedakan posisi simulator dari perangkat nyata secara eksplisit di
    panel internal agar tidak menyesatkan staf.
-   Tidak ada posisi yang diterima berarti tampilkan keadaan kosong;
    jangan membuat marker palsu.
-   Jangan menampilkan kontrol pemutus mesin jarak jauh.

------------------------------------------------------------------------

## 17. Keputusan terbuka yang harus tetap terbuka

Desain tidak boleh mengunci hal-hal berikut sebelum pemilik
mengonfirmasi keputusan sesuai PRD/ARCHITECTURE:

-   Metode pembayaran yang benar-benar diaktifkan dan rincian instruksi
    tiap metode.
-   Nilai deposit aktual per motor.
-   Batas tunggu tunai/no-show dan kebijakan refund no-show.
-   Batas booking tunai dan pembatalan dalam periode 30 hari.
-   Apakah selfie KTP diwajibkan berdasarkan pengaturan final.
-   Usia minimum final.
-   Retensi GPS final.
-   Toleransi dan rumus denda final.
-   Vendor email/GPS, object storage, hosting, library, dan scheduler
    yang dipakai.

Sampai diputuskan, gunakan data/pengaturan server yang sudah ada dan
label netral yang tidak menjanjikan kebijakan tertentu. Bila keputusan
menghalangi layar atau copy yang akurat, tandai bagian itu sebagai belum
siap---jangan mengarang nilai default di frontend.

------------------------------------------------------------------------

## 18. Checklist penerimaan desain dan UX

### Alur pelanggan

-   [ ] Pelanggan dapat menemukan katalog, detail motor, dan kalender
    ketersediaan.
-   [ ] Booking hanya dapat diteruskan jika prasyarat yang diperiksa
    server terpenuhi.
-   [ ] Profil dan dokumen tidak diminta ulang sebagai sumber kedua pada
    booking.
-   [ ] Total sewa, deposit, dan total yang dibayar konsisten di detail,
    review, pembayaran, dan dokumen.
-   [ ] Booking Saya memiliki kategori Menunggu pembayaran dan konsisten
    dengan pengelompokan admin.
-   [ ] Pembatalan mengikuti seluruh matriks PRD.
-   [ ] Label status dan pesan pengguna menggunakan Bahasa Indonesia.

### Alur staf/admin

-   [ ] Dokumen yang diunggah tidak otomatis terlihat terverifikasi.
-   [ ] Metode pembayaran yang terlihat sama dengan pilihan pelanggan.
-   [ ] Tombol serah-terima tidak aktif bila prasyarat belum terpenuhi
    dan alasannya jelas.
-   [ ] Checklist serah-terima kosong secara default.
-   [ ] Alur tunai memakai satu aksi atomik yang ditetapkan backend.
-   [ ] Pengembalian menampilkan perhitungan dari server dan tidak
    menganggap deposit sebagai pendapatan.
-   [ ] Pengelolaan armada/servis memperbarui ketersediaan.
-   [ ] GPS dan dokumen sensitif hanya terlihat oleh peran yang
    berwenang.

### Konsistensi dan ketahanan

-   [ ] Status, harga, dan kemampuan aksi berasal dari API/domain.
-   [ ] UI tidak menampilkan data mock, status hardcoded, atau fallback
    palsu di produksi.
-   [ ] Klik ganda tidak menggandakan efek.
-   [ ] Satu kegagalan menghasilkan satu pesan yang jelas.
-   [ ] Perubahan realtime diikuti pengambilan data terbaru dari API.
-   [ ] Data usang ditangani dengan refresh, bukan mutasi otomatis tanpa
    konfirmasi.
-   [ ] Loading, empty, error, offline/reconnect, dan success state
    dirancang.
-   [ ] Tampilan responsif dan dapat dioperasikan dengan keyboard.
-   [ ] Tidak ada data pribadi dalam event realtime, URL publik, atau
    pesan error.

### Tata kelola

-   [ ] Komponen UI tidak mengimplementasikan ulang aturan bisnis.
-   [ ] Semua keputusan terbuka tetap ditandai.
-   [ ] Tidak ada fitur di luar Rilis 1 yang disisipkan.
-   [ ] Implementasi diverifikasi terhadap repository yang nyata sebelum
    nama route, komponen, atau library dipastikan.

------------------------------------------------------------------------

## 19. Catatan implementasi

Dokumen ini menetapkan perilaku dan pola UX, bukan memaksakan struktur
folder, nama komponen, library UI, atau routing tertentu. Sebelum
implementasi:

1.  Periksa repository, desain yang sudah ada, dependency, pola
    form/tabel, dan routing.
2.  Gunakan kembali komponen yang konsisten dan aman.
3.  Pastikan API menyediakan status, alasan, dan `capabilities` yang
    diperlukan desain.
4.  Jika API belum menyediakan data yang dibutuhkan, jangan membuatnya
    di frontend; catat kebutuhan kontrak API dan rujuk ke
    PRD/ARCHITECTURE.
5.  Tambahkan tes untuk alur kritis dan kondisi error; jangan menyatakan
    tes lulus tanpa menjalankannya.

**Kriteria selesai:** pengguna bisa memahami status dan langkah
berikutnya tanpa menebak, data penting konsisten antara pelanggan dan
staf/admin, dan kemudahan UX tidak melemahkan satu pun aturan bisnis
RodaKita.
