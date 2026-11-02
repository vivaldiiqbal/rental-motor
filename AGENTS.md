# AGENTS.md --- RodaKita

> **Sumber acuan produk:**
> `PRD & MVP — RodaKita Platform Rental Motor Online`, versi 2.0,
> tanggal 25 Oktober 2026.\
> **Tujuan dokumen ini:** memberi instruksi kerja kepada coding agent
> agar perubahan tetap sesuai PRD, tidak mengarang kebutuhan, dan tidak
> melemahkan aturan bisnis maupun keamanan.

## 1. Aturan utama untuk coding agent

1.  **Baca repository sebelum mengubahnya.** Periksa struktur folder,
    `package.json`, konfigurasi, skema/migrasi database, route, service,
    UI, dan tes yang sudah ada. Jangan mengasumsikan struktur atau
    library tertentu sebelum memeriksanya.
2.  **PRD v2.0 adalah sumber kebenaran produk.** Jika implementasi yang
    ada bertentangan dengan PRD, jangan otomatis meniru implementasi
    lama. Identifikasi selisihnya, buat perubahan yang terarah, dan
    tambahkan tes regresi.
3.  **Jangan mengarang kebutuhan.** Jangan menambahkan fitur, status,
    aturan refund, field, integrasi, dependency, atau perilaku yang
    tidak ditetapkan oleh PRD atau kode proyek yang terverifikasi.
4.  **Jangan menebak keputusan yang masih terbuka.** Untuk keputusan
    berlabel "Perlu konfirmasi" atau "Terbuka" di PRD, pertahankan
    konfigurasi yang ada bila aman dan kompatibel; jika keputusan itu
    menghalangi implementasi yang benar, jelaskan pertanyaan dan
    dampaknya sebelum menetapkan perilaku baru.
5.  **Implementasikan aturan bisnis di server.** Frontend menampilkan
    kemampuan dan alasan yang dikirim server; frontend tidak menjadi
    otoritas untuk izin, harga, status, ketersediaan, kelayakan penyewa,
    atau pembatalan.
6.  **Perubahan harus dapat dibuktikan.** Untuk perubahan perilaku,
    tambahkan atau perbarui tes yang sesuai. Jangan mengklaim tes lulus
    jika belum dijalankan.
7.  **Kerjakan perubahan sekecil mungkin.** Hindari refactor luas yang
    tidak diperlukan. Jangan menghapus perilaku yang sudah ada tanpa
    memeriksa dampaknya dan menjelaskan alasannya.
8.  **Jangan menampilkan data palsu di jalur produksi.** Tidak boleh ada
    mock, placeholder realistis, data penyewa karangan, status
    hardcoded, atau fallback yang menyamarkan kegagalan backend.
9.  **Gunakan Bahasa Indonesia pada UI.** Status, pesan validasi, error
    yang dilihat pengguna, tombol, timeline, dan notifikasi antarmuka
    harus memakai label Bahasa Indonesia yang jelas, bukan kode internal
    mentah.
10. **Jika konteks tidak cukup, berhenti pada batas yang aman.**
    Laporkan file yang perlu diperiksa, asumsi yang belum terverifikasi,
    atau keputusan yang perlu dikonfirmasi. Jangan menutupi
    ketidakpastian dengan implementasi spekulatif.

## 2. Produk dan ruang lingkup

RodaKita adalah platform rental motor online dengan katalog pelanggan,
booking, pembayaran manual, panel admin/staf, operasional serah-terima
dan pengembalian, pengelolaan armada, sinkronisasi realtime, serta
fondasi GPS berbasis simulator.

### Rilis 1 / MVP

Implementasikan hanya lingkup Rilis 1 yang ditetapkan PRD:

-   Akun: daftar, masuk, profil, ganti sandi, verifikasi email, lupa
    sandi melalui email.
-   Profil penyewa lengkap, unggah KTP/SIM C/selfie sesuai aturan,
    verifikasi dokumen oleh admin/staf.
-   Katalog, pencarian berdasarkan tanggal, filter, detail motor,
    kalender ketersediaan.
-   Booking berbasis profil, snapshot harga/data/aturan, kode booking
    konsisten, kedaluwarsa.
-   Pembayaran manual: transfer bank, QRIS, e-wallet yang dikonfirmasi
    admin, dan tunai di lokasi.
-   Pembatalan sesuai matriks PRD, invoice, dan kwitansi.
-   Serah-terima dengan checklist dan foto kondisi; pengembalian, denda,
    deposit, no-show.
-   Booking manual oleh admin/staf untuk walk-in atau WhatsApp, dengan
    aturan yang sama.
-   CRUD armada, foto motor, jadwal servis, kalender armada.
-   SSE untuk sinkronisasi realtime pelanggan/admin/staf.
-   Fondasi GPS: simulator, peta admin, riwayat posisi,
    geofence/peringatan dan kontrol akses.
-   Dashboard, pengelolaan pengguna/peran, pengaturan dinamis, pesan
    kontak, laporan dasar, log audit.
-   Email transaksional yang tercantum dalam PRD.

### Di luar lingkup Rilis 1

Jangan mengimplementasikan sebagai bagian dari MVP kecuali diminta
secara eksplisit dan lingkupnya disetujui:

-   Payment gateway atau webhook pembayaran nyata.
-   Perangkat GPS nyata; gunakan abstraksi provider dan simulator.
-   Aplikasi mobile native, marketplace banyak pemilik, atau
    multi-cabang.
-   Penyewa warga negara asing.
-   Add-on, promo, diskon durasi, perpanjangan, pembayaran DP/sebagian.
-   Pemutus mesin jarak jauh.
-   2FA, notifikasi WhatsApp, dan fitur Rilis 2/3 lainnya.
-   Kontrak digital bertanda tangan atau integrasi akuntansi.

## 3. Arsitektur dan batas tanggung jawab

Stack yang ditetapkan PRD: **React, Node.js dengan Express, dan
PostgreSQL**. Jangan mengganti stack atau menambahkan framework utama
tanpa persetujuan.

Ikuti pola dan konvensi repository yang sudah ada. Bila struktur perlu
dibuat atau dirapikan, pisahkan tanggung jawab berikut tanpa memaksakan
nama folder tertentu:

-   **UI React:** presentasi, formulir, status loading/kosong/error, dan
    interaksi pengguna.
-   **API/controller Express:** parsing permintaan,
    autentikasi/otorisasi, validasi kontrak, dan pemanggilan service.
-   **Service/domain:** aturan bisnis, mesin status, kalkulasi
    harga/denda/deposit, kemampuan (capabilities), dan orkestrasi
    transaksi.
-   **Repository/data access:** query PostgreSQL terparameterisasi dan
    akses data.
-   **Database:** constraint, foreign key, unique/check constraints,
    exclusion constraint untuk ketersediaan, serta trigger transisi
    status bila dibutuhkan oleh rancangan PRD.
-   **Outbox/realtime:** catat event dalam transaksi yang sama dengan
    perubahan; kirim event hanya setelah commit.
-   **Integrasi eksternal:** email dan GPS melalui antarmuka provider
    yang dapat diganti; GPS MVP memakai simulator.

Jangan memindahkan aturan bisnis penting ke controller atau komponen
React jika aturan tersebut perlu dipakai bersama oleh beberapa jalur.

## 4. Invarian yang tidak boleh dilanggar

### 4.1 Sumber data tunggal dan snapshot

-   Profil pelanggan adalah sumber utama data identitas/kontak.
-   Booking menyimpan snapshot data penyewa, harga, aturan, dan versi
    syarat yang berlaku saat booking dibuat.
-   Nama/telepon penyewa tidak boleh diisi ulang sebagai data bebas pada
    formulir booking.
-   Status dokumen harus berasal dari satu fungsi/domain rule yang sama
    untuk API dan UI.
-   Metode pembayaran yang dipilih pelanggan harus tersimpan dan
    ditampilkan konsisten pada pelanggan, admin, invoice, dan laporan.
-   Nilai pengaturan yang berubah tidak boleh mengubah snapshot booking
    lama.
-   Field yang kosong ditampilkan sebagai **"Belum diisi"**; jangan
    menggantinya dengan data contoh.

### 4.2 Kelayakan penyewa dan dokumen

-   Profil lengkap wajib sebelum booking melalui semua jalur, termasuk
    API langsung, booking admin, dan impor jika ada.
-   Profil siap sewa hanya jika seluruh field wajib terisi, semua
    dokumen yang diwajibkan berstatus terverifikasi dan masih berlaku,
    serta persetujuan yang diwajibkan tercatat.
-   Dokumen: KTP, SIM C dan masa berlaku, serta selfie memegang KTP
    ketika pengaturan selfie aktif.
-   File yang diterima: JPG/JPEG, PNG, atau WebP; maksimum 2 MB; periksa
    magic bytes, bukan hanya ekstensi atau MIME dari klien.
-   Dokumen disimpan privat, di luar direktori yang disajikan sebagai
    file publik.
-   Nomor KTP disimpan sebagai HMAC-SHA256 untuk pencocokan, dengan
    empat digit terakhir untuk tampilan; jangan menyimpan atau
    menampilkan nomor KTP utuh tanpa kebutuhan dan desain keamanan yang
    disetujui.
-   Satu nomor KTP hanya boleh terkait dengan satu akun terverifikasi.
-   Perubahan nama, nomor KTP, tanggal lahir, atau dokumen setelah
    verifikasi harus mengembalikan status terkait ke menunggu verifikasi
    dan tercatat dalam audit.
-   SIM harus berlaku sampai setelah tanggal kembali booking; usia
    minimum diambil dari pengaturan (nilai awal PRD: 18 tahun).
-   Dokumen hanya boleh dibuka admin/staf yang berwenang; setiap akses
    dicatat.
-   Jangan pernah melewati verifikasi hanya karena dokumen diunggah oleh
    admin.

### 4.3 Ketersediaan dan tanggal booking

-   Cegah double booking pada tingkat database, bukan hanya dengan
    pemeriksaan UI atau query sebelum insert.
-   Gunakan semantik rentang tanggal **\[ambil, kembali)**: tanggal
    kembali dapat menjadi tanggal ambil booking lain.
-   Pembuatan booking dan blok servis harus memakai mekanisme
    penguncian/kontrol konkurensi yang konsisten per motor.
-   Dua permintaan bersamaan pada slot yang sama: tepat satu boleh
    berhasil.
-   Booking dan servis tidak boleh bertumpang tindih secara tidak sah.
-   Durasi awal 1--30 hari; tanggal ambil tidak boleh lampau menurut WIB
    dan paling jauh 180 hari ke depan; nilai yang dapat diatur harus
    bersumber dari database/pengaturan.
-   Harga dihitung di server dalam Rupiah bulat dan disimpan sebagai
    snapshot.
-   Kode booking harus mengikuti format **`RM-YYMMDD-XXXX`** dan unik.
    Jangan membuat format alternatif atau kode contoh di jalur produksi.
-   Booking manual tetap wajib melewati validasi profil dan ketersediaan
    yang sama.

### 4.4 Mesin status

Gunakan transisi yang eksplisit dan tolak transisi yang tidak sah pada
service/domain, dengan perlindungan database yang sesuai.

**Status booking:**

-   `pending` → `confirmed`, `active` (khusus tunai melalui alur
    atomik), `cancelled`, atau `expired`.
-   `confirmed` → `active`, `cancelled`.
-   `active` → `completed`.
-   `completed`, `cancelled`, dan `expired` adalah status akhir.

Label UI dalam Bahasa Indonesia: - `pending`: "Menunggu pembayaran"
(untuk online) atau label sesuai konteks tunai yang ditetapkan UI/PRD. -
`confirmed`: "Dikonfirmasi". - `active`: "Berjalan". - `completed`:
"Selesai". - `cancelled`: "Dibatalkan". - `expired`: "Kedaluwarsa".

**Status pembayaran:**

-   `pending` → `submitted`, `paid`, `cancelled`, `expired`.
-   `submitted` → `paid` atau `pending` jika bukti ditolak dengan
    catatan.
-   `paid` → `refunded` atau `needs_refund`.
-   `needs_refund` → `refunded`.
-   `cancelled`, `expired`, dan `refunded` adalah status akhir.

**Status dokumen:**

-   `not_uploaded` → `pending`.
-   `pending` → `verified` atau `rejected`.
-   `verified` → `pending` ketika data/file berubah, atau `expired`.
-   `rejected`/`expired` → `pending` setelah unggah ulang.

Jangan menambahkan transisi baru tanpa dasar PRD dan tes yang
menjelaskannya.

### 4.5 Harga, pembayaran, deposit, dan dokumen keuangan

-   Tampilkan tiga baris yang konsisten: **Total sewa**, **Deposit**,
    dan **Total yang dibayar**.
-   Total yang dibayar adalah sewa ditambah deposit sesuai kebijakan
    metode pembayaran.
-   Pembayaran online mencakup deposit bersama total; deposit tunai
    dicatat saat serah-terima.
-   Satu booking hanya memiliki satu baris pembayaran pending; jaga
    dengan constraint database yang sesuai.
-   Konfirmasi pembayaran memperbarui baris pembayaran yang ada, bukan
    membuat baris baru.
-   Konfirmasi harus idempotent. Klik ganda tidak boleh menggandakan
    pembayaran, invoice, kwitansi, atau efek lain.
-   Jumlah yang dikonfirmasi wajib sama dengan jumlah yang harus
    dibayar.
-   Jika metode yang dikonfirmasi berbeda dari metode pilihan pelanggan,
    simpan keduanya dan wajibkan alasan; tampilkan perbedaannya secara
    jelas.
-   Bukti bayar bersifat opsional sesuai PRD.
-   Invoice terbit saat pembayaran dikonfirmasi; kwitansi saat
    pembayaran dicatat. Nomor dokumen unik dan isi terbitan tidak
    diubah; koreksi dilakukan melalui dokumen baru.
-   Deposit bukan pendapatan. Perhitungan pendapatan mengikuti definisi
    PRD.
-   Jangan mengintegrasikan gateway pembayaran nyata pada Rilis 1.

### 4.6 Kebijakan pembatalan

Tegakkan aturan ini di server dan UI harus menampilkan kemampuan/alasan
dari server:

-   Booking online belum dibayar dan belum ada bukti bayar: pelanggan
    boleh membatalkan.
-   Setelah bukti bayar dikirim atau pembayaran dikonfirmasi: pelanggan
    tidak boleh membatalkan; arahkan ke admin sesuai kebijakan.
-   Booking tunai boleh dibatalkan pelanggan atau admin sampai
    serah-terima.
-   Booking berbayar hanya dapat dibatalkan admin dengan alasan dan
    keputusan refund; staf tidak boleh melakukannya.
-   Pembatalan harus atomik dan idempotent, serta membebaskan slot
    segera.
-   Jika pembayaran masuk setelah booking batal, tandai `needs_refund`.
-   Terapkan batas penyalahgunaan dari pengaturan: satu booking tunai
    belum diambil dan tiga pembatalan dalam 30 hari sebagai nilai awal
    PRD.
-   Jangan menerapkan skema refund bertingkat dari versi lama; PRD v2.0
    menggantinya.

### 4.7 Operasional sewa

-   Serah-terima hanya jika profil lengkap, dokumen terverifikasi dan
    berlaku, pembayaran lunas atau pembayaran tunai dicatat dalam
    transaksi, serta tanggal sesuai rentang sewa.
-   Checklist serah-terima kosong secara default; jangan pernah
    mencentang persetujuan petugas secara otomatis.
-   Catat odometer, bensin, kondisi, dan foto minimal empat sisi motor
    serta odometer. Foto bersifat privat dan hanya dapat ditambah
    setelah tahap terkait selesai.
-   **"Terima Tunai & Serah Terima"** harus menjadi satu transaksi
    atomik: pembayaran tunai, catatan serah-terima, dan status `active`
    semuanya berhasil atau semuanya batal.
-   Pengembalian mencatat odometer akhir, bensin, kerusakan, biaya lain,
    denda, dan perhitungan deposit. Odometer akhir tidak boleh lebih
    rendah dari awal; pengembalian tidak dapat diproses dua kali.
-   Deposit dikembalikan paling banyak satu kali dengan petugas dan
    waktu tercatat.
-   No-show hanya dapat diproses setelah jam ambil ditambah batas
    tunggu; awalnya 3 jam. Catat alasan `no_show` dan bebaskan slot.
-   Booking lama yang datanya tidak lengkap diblokir dengan peringatan;
    jangan memperbaiki atau melengkapi datanya otomatis.

### 4.8 Armada dan servis

-   Plat nomor motor unik.
-   Maksimum delapan foto per motor, satu foto utama, dan urutan foto
    tersimpan.
-   Motor tidak dapat dijadikan servis/nonaktif jika ada booking
    pending, confirmed, atau active yang belum berakhir; tampilkan
    daftar penyebab.
-   Status servis dihitung di server berdasarkan tanggal dan zona waktu
    WIB: Terjadwal, Berlangsung, Selesai.
-   Kalender armada dan daftar booking harus memakai pengelompokan
    status yang sama.

## 5. Realtime dan konkurensi

-   Gunakan **Server-Sent Events (SSE)** sesuai PRD, dengan tiket sekali
    pakai berumur 30 detik.
-   Event berisi jenis, ID, dan versi; jangan mengirim data pribadi
    melalui payload event.
-   Catat event pada outbox dalam transaksi yang sama dengan mutasi;
    kirim hanya setelah commit.
-   Batasi event berdasarkan identitas dan peran: pelanggan hanya
    menerima event miliknya; admin/staf hanya menerima event sesuai
    izin.
-   Dukung `Last-Event-ID` dengan retensi event 24 jam, heartbeat,
    reconnect bertahap, refresh data setelah reconnect, indikator
    koneksi, dan polling cadangan bila SSE tidak tersedia.
-   Perubahan yang memengaruhi ketersediaan harus memicu event
    `motor.availability.changed`.
-   Gunakan kolom `version` untuk data yang perlu kontrol konkurensi.
    Mutasi dengan versi usang harus mengembalikan HTTP 409 dengan kode
    `STALE_DATA` dan pesan Bahasa Indonesia yang sesuai.
-   Target sinkronisasi PRD: p95 paling lama 2 detik.
-   Jangan menjadikan event realtime sebagai sumber kebenaran; klien
    mengambil data terbaru melalui API yang memeriksa izin.

## 6. GPS dan privasi lokasi

-   Rilis 1 memakai simulator, bukan mengklaim dukungan perangkat GPS
    nyata.
-   Pertahankan abstraksi provider yang dapat diganti, misalnya
    simulator dan adapter yang disiapkan untuk integrasi berikutnya.
-   Validasi data posisi; data rusak, duplikat, atau tidak berurutan
    tidak boleh merusak data maupun menjatuhkan server.
-   Peta, riwayat rute, dan peringatan lokasi hanya tersedia untuk
    admin/staf berwenang.
-   Peringatan perlu debounce agar satu kondisi tidak menghasilkan
    notifikasi berulang tanpa batas; petugas dapat mengakuinya.
-   Catat persetujuan pelacakan, akses lokasi, dan perubahan perangkat.
-   Retensi awal lokasi 90 hari merupakan nilai awal yang masih perlu
    konfirmasi; gunakan pengaturan dan jangan menganggapnya sebagai
    keputusan final.
-   Jangan pernah menambahkan fitur pemutus mesin jarak jauh.

## 7. Peran, otorisasi, dan audit

-   Peran selalu dibaca dan diverifikasi di server pada setiap
    permintaan. Tidak ada pemilih peran di klien yang dapat menaikkan
    hak akses.
-   Terapkan matriks izin PRD: pelanggan mengelola profil sendiri dan
    booking miliknya sesuai kebijakan; staf/admin menangani operasional
    yang diizinkan; tindakan pembatalan booking berbayar, pengaturan,
    pengguna/peran, laporan, dan pengelolaan armada mengikuti hak admin
    yang ditetapkan.
-   Admin terakhir tidak boleh dinonaktifkan atau diturunkan perannya.
-   Audit bersifat append-only dan mencakup semua aksi mutasi yang
    diwajibkan. Jika pencatatan audit gagal, mutasi terkait harus
    dibatalkan.
-   Audit minimal mencatat aktor, tindakan, objek, waktu, hasil, dan
    konteks yang diperlukan tanpa membocorkan rahasia.
-   Jangan menulis sandi, token, nomor KTP utuh, isi dokumen, atau
    rahasia lain ke log.
-   Semua query harus terparameterisasi. Terapkan validasi input,
    sanitasi output yang relevan, rate limit, CORS terbatas, dan HTTPS
    di production.
-   Sandi menggunakan bcrypt sesuai PRD. Admin memerlukan sandi minimal
    12 karakter, pembatasan percobaan login, sesi awal maksimal 8 jam,
    dan pencatatan login.
-   Jangan menyimpan data kartu pembayaran.

## 8. Pengaturan dan keputusan yang belum final

Pengaturan yang berubah harus disimpan di database, divalidasi, berlaku
tanpa restart, diaudit, dan snapshot booking lama tidak boleh berubah.

PRD mencatat hal berikut sebagai **perlu konfirmasi/terbuka**; jangan
menyatakan sudah final:

-   Apakah metode pembayaran manual MVP sudah dikonfirmasi oleh pemilik.
-   Kebijakan deposit dan nilai deposit tiap motor.
-   Batas tunggu tunai/no-show 3 jam dan kebijakan refund no-show.
-   Batas satu booking tunai belum diambil dan tiga pembatalan per 30
    hari.
-   Kewajiban selfie memegang KTP.
-   Usia minimum 18 tahun.
-   Retensi data lokasi 90 hari.
-   Toleransi keterlambatan 2 jam dan denda awal 10% per jam, termasuk
    batas denda harian.
-   Perangkat GPS, kartu data, penyedia email transaksional, dan domain
    pengirim.

Gunakan nilai awal PRD hanya sebagai nilai konfigurasi awal yang dapat
diubah, bukan sebagai keputusan hukum atau bisnis yang telah
dikonfirmasi. Syarat Sewa dan Kebijakan Privasi harus ditinjau penasihat
hukum sebelum peluncuran.

## 9. Bahasa API dan pengalaman pengguna

-   Ikuti kontrak API yang sudah ada; dokumentasikan perubahan kontrak.
-   Gunakan format error yang konsisten dan pesan pengguna dalam Bahasa
    Indonesia.
-   Kode internal boleh digunakan dalam respons terstruktur, tetapi
    jangan tampilkan kode mentah seperti `PROFILE_INCOMPLETE` atau
    `STALE_DATA` sebagai teks utama kepada pengguna.
-   Untuk profil tidak lengkap, API booking menolak dengan HTTP 403 dan
    kode `PROFILE_INCOMPLETE`, disertai daftar kekurangan yang dapat
    ditindaklanjuti.
-   Untuk versi data usang, gunakan HTTP 409 dan kode `STALE_DATA`.
-   Server mengirim `capabilities` beserta alasan yang dapat
    ditampilkan, misalnya boleh/tidak boleh batal, bayar, atau
    serah-terima.
-   Gunakan satu modul pemetaan status dan pengelompokan tab bersama.
    Tab: **Semua**, **Menunggu pembayaran**, **Akan datang**,
    **Berjalan**, **Riwayat**; angka berasal dari server.
-   Setiap halaman memiliki keadaan memuat, kosong, dan galat. Jangan
    menampilkan layar putih saat database kosong atau backend gagal.
-   Satu kegagalan menghasilkan satu toast; nonaktifkan tombol selama
    aksi berlangsung dan lindungi endpoint dari efek klik ganda.
-   UI mobile-first pada lebar 360--1440 px, aksesibel dengan keyboard,
    dan memenuhi WCAG AA sejauh dapat diuji.

## 10. Database, migrasi, dan data uji

-   Gunakan migrasi berurutan dengan checksum sesuai mekanisme proyek.
-   Utamakan integritas database: foreign key, `UNIQUE`, `CHECK`,
    exclusion constraint, dan trigger sesuai kebutuhan domain.
-   Semua operasi multi-tabel yang membentuk satu aksi bisnis harus
    berada dalam transaksi.
-   Jangan menggunakan pola "cek ketersediaan lalu insert" tanpa
    perlindungan konkurensi di database.
-   Seed hanya untuk tes otomatis/development yang terisolasi. Seed
    harus menolak berjalan di production.
-   Jangan mencampur mock dengan data nyata atau menyisipkan data contoh
    melalui jalur aplikasi produksi.
-   Sediakan/pertahankan pemeriksaan integritas `db:verify` jika skrip
    proyek mendukung atau PRD mengharuskannya; jangan mengarang hasil
    pemeriksaan.
-   Skrip pembersih database harus memiliki pengaman lingkungan
    eksplisit, konfirmasi/desain dry-run yang sesuai, serta mekanisme
    snapshot/pemulihan. Jangan pernah menjalankan pembersihan destruktif
    tanpa izin eksplisit dan verifikasi target database.
-   Backup production harus terenkripsi, disimpan di luar server, dan
    pemulihannya diuji saat deployment.

## 11. Standar implementasi dan kualitas kode

-   Ikuti gaya penamaan, formatter, linter, pola modul, dan versi
    runtime yang telah ditetapkan repository.
-   Hindari dependency baru jika fitur dapat dibangun dengan dependency
    yang sudah tersedia. Jika dependency baru benar-benar diperlukan,
    jelaskan alasan dan dampaknya.
-   Gunakan query PostgreSQL terparameterisasi; jangan menyusun SQL dari
    input pengguna.
-   Hindari `catch` yang menelan error, fallback yang menyamarkan
    kegagalan, dan respons sukses palsu.
-   Jangan mengandalkan jam lokal mesin untuk aturan bisnis. Gunakan
    zona waktu **WIB** secara eksplisit untuk aturan tanggal/jam yang
    ditetapkan PRD, terutama tanggal ambil/kembali, servis, no-show, dan
    pelaporan.
-   Kalkulasi uang menggunakan integer Rupiah bulat atau pendekatan
    desimal yang aman; jangan memakai floating-point secara ceroboh
    untuk nilai uang.
-   Mutasi yang bisa diulang harus idempotent, termasuk konfirmasi
    pembayaran, pembatalan, serah-terima, pengembalian, dan pengembalian
    deposit.
-   Log aplikasi terstruktur harus memuat `requestId`; health check
    harus melaporkan kondisi database.
-   Jangan menyimpan rahasia di repository. Gunakan konfigurasi
    lingkungan dan validasi konfigurasi saat startup.
-   Jangan mengubah file hasil generate, lockfile, atau migrasi lama
    tanpa memahami dampak dan kebutuhan perubahan.

## 12. Strategi pengujian wajib

Pilih perintah tes yang benar dari `package.json` dan konfigurasi
proyek; jangan mengasumsikan nama skrip. Jalankan tes terarah dahulu,
kemudian tes regresi yang relevan.

Perubahan pada domain berikut harus disertai tes yang sesuai:

-   Kelengkapan profil dan penolakan booking dari setiap jalur.
-   Status dokumen dan invalidasi verifikasi setelah perubahan data.
-   Ketersediaan atomik, booking paralel, dan konflik
    booking-versus-servis.
-   Kalkulasi harga, snapshot, deposit, denda, dan laporan pendapatan.
-   Semua sel matriks pembatalan.
-   Idempotensi konfirmasi pembayaran, serah-terima tunai, pengembalian,
    dan pengembalian deposit.
-   Transisi status yang sah/tidak sah.
-   Otorisasi peran dan kepemilikan data.
-   Keamanan unggahan, akses dokumen, dan data KTP.
-   Isolasi event realtime antar pengguna, reconnect, dan versi usang.
-   GPS: data invalid, duplikat, posisi terbalik, geofence, offline, dan
    pembatasan akses.
-   Seed yang menolak production dan database kosong.
-   Label Bahasa Indonesia, status kosong/loading/error, dan toast
    tunggal.
-   Ekspor CSV aman dari formula injection.

Gerbang rilis PRD:

-   Semua tes otomatis hijau **dua kali berturut-turut**.
-   Tes penerimaan untuk cacat D-01 sampai D-16 lulus.
-   Cakupan service minimal 85%.
-   Uji konkurensi memakai PostgreSQL nyata: 20 booking paralel pada
    slot yang sama, booking melawan servis, pembatalan melawan
    pembayaran, serah-terima ganda, dan admin terakhir; ulangi lima kali
    tanpa double booking atau deadlock.
-   Uji E2E Playwright dengan PostgreSQL nyata mencakup siklus sewa
    lengkap dan metode pembayaran MVP.
-   Uji realtime memenuhi target 2 detik dan pulih otomatis setelah
    gangguan.
-   Uji 10.000 booking sintetis: p95 endpoint utama maksimal 300 ms.
-   Tidak ada pelanggaran keamanan atau aksesibilitas serius yang belum
    diselesaikan.
-   Tidak ada cacat kritis/tinggi terbuka sebelum rilis.

Jangan mengklaim suatu gerbang terpenuhi kecuali hasil tes atau laporan
yang mendukungnya tersedia.

## 13. Alur kerja untuk setiap tugas

1.  **Pahami permintaan.** Tentukan modul dan kriteria penerimaan PRD
    yang relevan.
2.  **Inspeksi repository.** Temukan implementasi, tes, skema, dan
    konvensi yang sudah ada.
3.  **Petakan dampak.** Identifikasi API, database, UI, status, izin,
    event realtime, dan data lama yang terdampak.
4.  **Nyatakan ketidakpastian.** Jika kebutuhan bertentangan atau
    keputusan bisnis belum final, jelaskan sebelum mengunci perilaku.
5.  **Implementasikan perubahan minimal.** Aturan penting tetap di
    server/domain/database; gunakan transaksi dan audit yang sesuai.
6.  **Tambahkan tes regresi.** Sertakan kasus berhasil, gagal, izin
    ditolak, idempotensi, dan konkurensi jika relevan.
7.  **Jalankan tes.** Jalankan tes terarah, lint/typecheck/build yang
    tersedia, lalu tes relevan yang lebih luas.
8.  **Tinjau diff.** Pastikan tidak ada data mock, rahasia, perubahan
    tak terkait, log sensitif, atau pelemahan aturan.
9.  **Laporkan hasil dengan jujur.** Sebut file utama yang berubah,
    perilaku yang berubah, tes yang benar-benar dijalankan beserta
    hasilnya, dan pekerjaan/risiko yang tersisa.

Jangan menjalankan migrasi destruktif, menghapus data, mengubah
production, melakukan deployment, atau mengirim komunikasi eksternal
kecuali diminta secara eksplisit dan targetnya telah diverifikasi.

## 14. Format ringkasan akhir tugas

Setelah menyelesaikan pekerjaan, berikan ringkasan singkat dengan
format:

-   **Perubahan:** apa yang berubah dan mengapa.
-   **Kesesuaian PRD:** ID persyaratan atau aturan yang dipenuhi.
-   **Tes:** perintah yang benar-benar dijalankan dan hasilnya.
-   **Belum dikerjakan/risiko:** bagian yang belum terverifikasi,
    keputusan yang perlu dikonfirmasi, atau keterbatasan lingkungan.

Jangan mengatakan "selesai", "aman", "production-ready", atau "semua tes
lulus" jika bukti yang tersedia tidak mendukung klaim tersebut.
