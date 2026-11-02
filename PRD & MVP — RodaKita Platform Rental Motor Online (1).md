# PRD & MVP — RodaKita: Platform Rental Motor Online

**Versi:** 2.0 (menggantikan 1.0 dan 1.1) · **Tanggal:** 25 Okt 2026 · **Stack:** React, Node.js (Express), PostgreSQL

Versi 2.0 menetapkan MVP rental motor yang aman, sinkron, dan realtime, disusun dari 16 cacat yang ditemukan pada uji nyata versi 1.x. Setiap cacat dipetakan ke persyaratan dan tes penerimaan.

## 1. Ringkasan Eksekutif

RodaKita adalah platform rental motor online: pelanggan memesan dan membayar, petugas memverifikasi identitas, menyerahkan, menerima kembali, dan memantau motor, semuanya dari satu sumber data yang sinkron secara realtime.

**Mengapa versi 2.0.** Uji nyata terhadap versi 1.x menemukan 16 cacat (bagian 2): booking bisa dibuat tanpa dokumen, data penyewa di admin berbeda dengan di pelanggan, kontak darurat berisi data karangan, metode pembayaran tidak sinkron, dan pelanggan tidak bisa membatalkan. Penyebabnya bukan satu bug. PRD lama merinci fitur, tetapi tidak menetapkan sumber data tunggal, mesin status, aturan pembatalan, dan sinkronisasi, sehingga setiap bagian dibangun dengan asumsinya sendiri.

**Yang berubah di 2.0.** (1) Prinsip desain yang mencegah cacat sejenis (bagian 5). (2) Standar data penyewa dan verifikasi identitas yang ketat (bagian 9). (3) Kebijakan pembatalan baru: boleh batal sebelum membayar, tidak boleh setelah membayar, tunai boleh batal sampai serah terima (bagian 8). (4) Sinkronisasi realtime antara pelanggan dan admin (bagian 10). (5) Pelacakan GPS dengan simulator lebih dulu, perangkat nyata setelah server siap (bagian 11). (6) Gerbang kualitas yang wajib lulus sebelum rilis (bagian 14).

**Hasil yang diharapkan.** Satu siklus sewa lengkap berjalan tanpa cacat data atau logika: daftar, profil lengkap, dokumen terverifikasi, booking, bayar, serah terima, kembali, deposit, dengan data identik di dasbor pelanggan dan panel admin.

## 2. Hasil Uji Nyata v1.x dan Keterlacakan

Tabel ini menghubungkan setiap temuan dengan persyaratan (bagian 7) dan tes yang membuktikan perbaikannya. Akar masalah ditulis dari gejala uji; yang diberi kata 'diduga' dikonfirmasi pada tahap diagnosis perbaikan.

| ID | Temuan uji nyata | Akar masalah | Persyaratan | Tes penerimaan |
| --- | --- | --- | --- | --- |
| D-01 | Booking dibuat tanpa dokumen dan tanpa kontak darurat | Verifikasi dokumen dimatikan di konfigurasi dan tidak ditegakkan di server | FR-ID-01, FR-ID-03, FR-BKG-02 | Booking lewat API tanpa profil lengkap ditolak 403 |
| D-02 | Kartu status dokumen admin 'Terverifikasi' padahal dokumen belum diunggah | Tampilan memakai logika terpisah dari pemeriksaan server | FR-ID-05 | Status di UI sama dengan hasil server pada semua kombinasi status |
| D-03 | Serah terima diblokir tanpa jalan keluar; pesan memakai kode mentah | Pengaman server benar, tetapi booking tidak seharusnya sampai tahap ini dan tidak ada jalur resmi melengkapi dokumen | FR-OPS-01, FR-ID-10, FR-UX-01 | Tombol nonaktif disertai alasan; admin dapat mengunggah dokumen atas nama pelanggan lalu memverifikasi |
| D-04 | Nama dan telepon penyewa berbeda antara admin dan pelanggan | Dua sumber data: isian bebas di booking dan data akun | FR-ID-04, FR-BKG-02 | Setiap field penyewa identik di kedua sisi |
| D-05 | Kontak darurat di admin berisi data karangan | Nilai bawaan tertulis di kode | FR-ID-06 | String karangan nihil di seluruh kode; field kosong tampil 'Belum diisi' |
| D-06 | Metode pembayaran di admin tidak sama dengan pilihan pelanggan | Konfirmasi admin menulis metode dan nama bank tetap serta diduga membuat baris pembayaran baru | FR-PAY-02, FR-PAY-03, FR-PAY-04 | Satu baris pembayaran per booking; metode sama di kedua sisi |
| D-07 | Pelanggan tidak bisa membatalkan booking | Fitur dan matriks aturan belum ada | FR-CAN-01 sampai FR-CAN-06 | Setiap sel matriks pembatalan diuji di API dan E2E |
| D-08 | Label status dan timeline berbahasa Inggris mentah | Tidak ada pemetaan label bersama | FR-UX-01 | Pemindaian UI tidak menemukan teks status mentah |
| D-09 | Tab 'Booking Saya' tidak punya 'Menunggu pembayaran' dan berbeda dari pengelompokan admin | Pengelompokan status tidak didefinisikan | FR-UX-02, FR-RT-05 | Jumlah dan isi tab identik di pelanggan dan admin |
| D-10 | Ringkasan tidak menampilkan total yang dibayar; deposit membingungkan | Aturan deposit tidak ditetapkan (online atau saat serah terima) | FR-BKG-04, FR-PAY-05 | Tiga baris harga konsisten di semua halaman dan invoice |
| D-11 | Perubahan di admin tidak langsung tampil di sisi pelanggan | Tidak ada mekanisme siaran perubahan | FR-RT-01 sampai FR-RT-04 | Perubahan tampil di sisi lain dalam 2 detik tanpa muat ulang |
| D-12 | Toast error ganda dan risiko klik ganda | Error diduga ditampilkan oleh dua lapisan; aksi belum dilindungi dari klik ganda | FR-UX-03 | Satu toast per kegagalan; klik ganda menghasilkan satu efek |
| D-13 | Data contoh bercampur data nyata; pemilih 'Role'; contoh kode RK-xxxx | Seed dan mock berbagi jalur dengan data nyata | FR-DATA-01, FR-ADM-01 | Database bersih lolos pemeriksaan; peran hanya label dari server |
| D-14 | Ulasan bisa dihapus permanen; kolom 'Unit' generik | Hapus keras diizinkan; nama motor tidak diambil dari database | FR-ADM-03 | Hanya sembunyikan/tampilkan; nama motor asli tampil |
| D-15 | Status servis 'Terjadwal' padahal sedang berlangsung | Status disimpan, tidak dihitung dari tanggal | FR-AST-03 | Status dihitung server menurut tanggal WIB |
| D-16 | Kotak centang serah terima sudah tercentang dari awal | Nilai bawaan tercentang | FR-OPS-02 | Kotak kosong secara default; tombol aktif hanya setelah dicentang petugas |

## 3. Tujuan, Bukan-Tujuan, dan Metrik

### Tujuan produk

1. Identitas dan kontak penyewa lengkap dan terverifikasi sebelum motor keluar.
2. Satu kebenaran: dasbor pelanggan dan panel admin menampilkan data identik, realtime.
3. Nol double booking dan nol transisi status yang tidak sah.
4. Pembayaran dan pembatalan sesuai kebijakan, tercatat jelas dan dapat ditelusuri.
5. Motor dapat dipantau lewat GPS dengan privasi pelanggan terjaga.

### Bukan-tujuan rilis 1

- Aplikasi mobile native, marketplace banyak pemilik, multi-cabang.
- Fitur mematikan mesin motor dari jarak jauh (risiko keselamatan dan hukum).
- Penyewa warga negara asing (paspor, SIM internasional): ditunda ke rilis 3.
- Kontrak digital bertanda tangan dan integrasi akuntansi.

### Metrik keberhasilan

Target awal; sesuaikan dengan kondisi bisnis setelah soft launch.

| Metrik | Cara ukur | Target |
| --- | --- | --- |
| Double booking | Audit data dan uji konkurensi | 0 |
| Ketidakcocokan data admin dan pelanggan | Uji otomatis per field | 0 |
| Booking tanpa profil lengkap dan dokumen terverifikasi | Kueri integritas | 0 |
| Booking berjalan atau selesai tanpa catatan serah terima | Kueri integritas | 0 |
| Latensi sinkronisasi realtime (p95) | Uji E2E dua browser | ≤ 2 detik |
| Respons endpoint utama (p95) pada 10.000 booking | Uji performa | ≤ 300 ms |
| Waktu menyelesaikan booking (profil sudah lengkap) | Dari 'Sewa Sekarang' sampai bayar | < 3 menit |
| Waktu verifikasi dokumen oleh admin | Unggah sampai keputusan | < 4 jam kerja |
| Booking pending yang kedaluwarsa | Expired / total dibuat | ≤ 30% |
| Tingkat no-show | No-show / booking dikonfirmasi | ≤ 5% |
| Email transaksional terkirim | Terkirim / dijadwalkan | ≥ 98% |
| Cacat kritis atau tinggi yang masih terbuka saat rilis | Daftar cacat | 0 |
| Ketersediaan layanan | Uptime | ≥ 99% |

## 4. Pengguna dan Peran

| Persona | Kebutuhan | Titik sakit |
| --- | --- | --- |
| Pelanggan pendatang atau wisatawan | Cari motor cepat, harga jelas, proses mudah dimengerti | Takut tertipu, tidak tahu dokumen yang diperlukan |
| Pelanggan lokal | Sewa harian atau mingguan, status jelas | Bolak-balik chat, tidak tahu status pesanan |
| Pemilik atau admin | Kontrol armada, uang, risiko, laporan | Motor tidak kembali, sengketa denda dan deposit |
| Staf operasional | Serah terima dan pengembalian cepat dengan daftar periksa | Catatan kondisi tidak konsisten, data tidak lengkap |

### Matriks izin

| Kemampuan | Pelanggan | Staf | Admin |
| --- | :-: | :-: | :-: |
| Lihat dan ubah profil sendiri | ✔ | ✔ | ✔ |
| Booking, bayar, batalkan (sesuai aturan) | ✔ |  |  |
| Verifikasi dokumen |  | ✔ | ✔ |
| Konfirmasi pembayaran manual |  | ✔ | ✔ |
| Serah terima, pengembalian, no-show |  | ✔ | ✔ |
| Booking manual untuk walk-in atau WhatsApp |  | ✔ | ✔ |
| Jadwal servis dan kalender |  | ✔ | ✔ |
| Peta GPS dan peringatan |  | ✔ | ✔ |
| Batalkan booking berbayar dan putuskan refund |  |  | ✔ |
| Kelola motor, promo, add-on, lokasi |  |  | ✔ |
| Pengaturan, pengguna dan peran, laporan, log audit |  |  | ✔ |

Peran selalu dibaca dari server pada setiap permintaan; tidak ada pengalih peran di sisi klien.

## 5. Prinsip Desain Produk

Delapan aturan arsitektur berikut ditetapkan karena kegagalannya terlihat langsung pada uji v1.x. Semua persyaratan di bagian 7 harus mematuhinya.

1. **Satu sumber kebenaran per data.** Profil penyewa, status dokumen, status booking, dan metode pembayaran masing-masing dihitung atau disimpan di satu tempat, dan semua tampilan membacanya dari sana (D-02, D-04, D-06).
2. **Server menegakkan aturan; antarmuka mengikuti.** Server mengirim kemampuan (capabilities) seperti boleh batal atau boleh serah terima beserta alasannya; UI tidak menghitung ulang aturan bisnis (D-01, D-03, D-07).
3. **Mesin status eksplisit.** Booking, pembayaran, dan dokumen punya tabel transisi; transisi di luar tabel ditolak oleh service dan dijaga lagi oleh database.
4. **Tidak ada data karangan.** Data yang belum diisi tampil 'Belum diisi'; tidak ada nilai bawaan palsu di kode atau seed produksi (D-05, D-13).
5. **Setiap perubahan tercatat dan tersiar.** Audit ditulis dalam transaksi yang sama dengan perubahan data; peristiwa realtime dikirim hanya setelah commit (D-11).
6. **Snapshot saat booking.** Harga, aturan, data penyewa, dan versi syarat yang berlaku dibekukan pada booking, sehingga perubahan pengaturan tidak mengubah booking lama.
7. **Gagal dengan aman.** Aksi idempotent, kontrol konkurensi (version), pesan Bahasa Indonesia yang menjelaskan langkah berikutnya, dan tidak ada crash (D-12).
8. **Data bersih untuk uji nyata.** Seed hanya untuk tes otomatis; lingkungan uji nyata diisi lewat panel admin dan dapat di-snapshot dan dipulihkan.

## 6. Ruang Lingkup dan Rilis

Rilis 1 (MVP) adalah standar minimum rental motor yang aman dan sinkron. Rilis 2 menambah integrasi perangkat dan pembayaran nyata. Rilis 3 adalah pengembangan lanjutan. Fitur yang sudah dibangun tetapi bukan syarat rilis tetap harus lulus tes regresi, namun tidak menahan peluncuran.

| Modul | Fitur | R1 MVP | R2 | R3 |
| --- | --- | :-: | :-: | :-: |
| **Identitas dan akun** | Daftar, masuk, profil, ganti sandi, verifikasi email, lupa sandi via email | ✔ |  |  |
|  | Profil penyewa lengkap sesuai standar (bagian 9) | ✔ |  |  |
|  | Dokumen KTP, SIM C, selfie; verifikasi admin; validasi usia, masa berlaku SIM, KTP ganda | ✔ |  |  |
|  | Persetujuan Syarat Sewa, Kebijakan Privasi, pelacakan GPS (versi tercatat) | ✔ |  |  |
|  | Penyewa WNA (paspor, SIM internasional) |  |  | ✔ |
| **Katalog** | Beranda, pencarian tanggal, daftar, filter, detail, kalender tanggal terisi | ✔ |  |  |
|  | Bandingkan, favorit, FAQ, testimoni |  | ✔ |  |
| **Booking dan pembayaran** | Booking dari profil, snapshot, kedaluwarsa otomatis, kode booking konsisten | ✔ |  |  |
|  | Pembayaran manual: transfer bank, QRIS, e-wallet, bukti bayar opsional, konfirmasi admin | ✔ |  |  |
|  | Tunai di lokasi | ✔ |  |  |
|  | Pembatalan sesuai kebijakan baru, invoice dan kwitansi | ✔ |  |  |
|  | Payment gateway dan webhook |  | ✔ |  |
|  | Add-on, antar jemput, promo, diskon durasi |  | ✔ |  |
|  | Perpanjangan sewa, pembayaran sebagian (DP) |  | ✔ |  |
|  | Tarif akhir pekan dan musiman |  |  | ✔ |
| **Operasional** | Serah terima dengan foto kondisi, pengembalian, denda, deposit | ✔ |  |  |
|  | No-show, booking manual untuk walk-in atau WhatsApp | ✔ |  |  |
|  | Ganti unit saat motor rusak, daftar hitam pelanggan |  | ✔ |  |
| **Armada** | CRUD motor dan foto, status, jadwal servis, kalender armada | ✔ |  |  |
| **Realtime dan GPS** | Sinkronisasi realtime pelanggan dan admin | ✔ |  |  |
|  | GPS fondasi: simulator, peta admin, peringatan | ✔ |  |  |
|  | GPS dengan perangkat pelacak nyata |  | ✔ |  |
| **Admin** | Dashboard, pengguna dan peran, pengaturan dinamis, pesan, laporan dasar, log audit | ✔ |  |  |
|  | Sandi admin kuat, pembatasan login, sesi pendek | ✔ |  |  |
|  | 2FA admin, ulasan dan rating, notifikasi WhatsApp |  | ✔ |  |
| **Notifikasi** | Email transaksional: verifikasi, konfirmasi, status dokumen, pengingat, pembatalan | ✔ |  |  |

## 7. Persyaratan Fungsional

Setiap persyaratan punya ID yang dirujuk oleh bagian 2 dan oleh tes. Semua berlaku untuk rilis 1 kecuali dinyatakan lain di bagian 6.

### 7.1 Identitas dan profil (FR-ID)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-ID-01 | Profil penyewa lengkap (bagian 9) wajib sebelum booking | Profil lengkap hanya bila semua field wajib terisi, dokumen terverifikasi, dan persetujuan tercatat; satu fungsi menghitungnya dan menyebut kekurangannya |
| FR-ID-02 | KTP, SIM C, dan selfie memegang KTP diunggah lalu diverifikasi admin | jpg/png/webp, maksimal 2 MB, magic bytes diperiksa; status dokumen tampil jelas bagi pelanggan |
| FR-ID-03 | Server menolak booking tanpa profil lengkap di semua jalur (pelanggan, admin, impor) | Permintaan API langsung menghasilkan 403 PROFILE\_INCOMPLETE beserta daftar kekurangan; aturan tidak dapat dimatikan di production |
| FR-ID-04 | Data penyewa berasal dari profil dan disalin ke booking sebagai snapshot tak berubah | Form booking tidak punya isian bebas nama atau telepon; admin dan pelanggan membaca field yang sama |
| FR-ID-05 | Status dokumen dihitung satu fungsi yang dipakai pemeriksaan server dan semua tampilan | Tidak ada status dokumen yang diturunkan dari flag konfigurasi atau ditulis tetap |
| FR-ID-06 | Tidak ada data bawaan karangan; field kosong tampil 'Belum diisi' | Pencarian string karangan di repository nihil; uji tampilan field kosong |
| FR-ID-07 | Mengubah nama, nomor KTP, tanggal lahir, atau dokumen setelah verifikasi mengembalikan status ke menunggu | Perubahan tercatat di audit; booking baru diblokir sampai verifikasi ulang |
| FR-ID-08 | Persetujuan Syarat Sewa, Kebijakan Privasi, dan pelacakan GPS tersimpan dengan versi, waktu, dan IP | Booking menyimpan versi syarat yang disetujui |
| FR-ID-09 | Satu nomor KTP hanya untuk satu akun terverifikasi | Nomor disimpan sebagai HMAC; duplikat ditolak dengan pesan untuk admin |
| FR-ID-10 | Admin dapat mengunggah dokumen atas nama pelanggan yang sudah punya akun, lalu memverifikasinya | Ditandai uploaded\_by\_admin dan tercatat di audit; tidak ada jalan pintas melewati verifikasi |

### 7.2 Booking (FR-BKG)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-BKG-01 | Pencarian berdasarkan tanggal dan ketersediaan yang atomik | Dua booking bersamaan pada slot sama: tepat satu berhasil; tanggal kembali boleh sama dengan tanggal ambil booking lain |
| FR-BKG-02 | Booking dibuat dari profil tanpa isian identitas bebas | Ringkasan penyewa hanya baca dengan tautan 'Ubah di profil' |
| FR-BKG-03 | Harga dihitung server dan disimpan sebagai snapshot beserta aturan yang berlaku | Perubahan harga atau pengaturan tidak mengubah booking lama |
| FR-BKG-04 | Rincian tiga baris di semua halaman dan invoice: Total sewa, Deposit, Total yang dibayar | Angka sama di checkout, dasbor pelanggan, admin, dan invoice |
| FR-BKG-05 | Kedaluwarsa otomatis | Online 60 menit; tunai sampai jam ambil ditambah batas tunggu; motor tersedia kembali seketika |
| FR-BKG-06 | Kode booking unik RM-YYMMDD-XXXX dengan format sama di seluruh antarmuka | Tidak ada contoh atau format lain di UI |
| FR-BKG-07 | Booking manual oleh admin untuk walk-in atau WhatsApp memakai aturan yang sama | Sumber tercatat (web, walk\_in, whatsapp); profil lengkap tetap wajib |

### 7.3 Pembayaran (FR-PAY)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-PAY-01 | Metode: transfer bank, QRIS, e-wallet (manual, dikonfirmasi admin), dan tunai di lokasi | Pilihan pelanggan dikirim ke server dan tersimpan |
| FR-PAY-02 | Pilihan pelanggan tersimpan sebagai satu baris pembayaran pending beserta rincian (bank atau penyedia, referensi) | Satu pembayaran pending per booking dijaga database |
| FR-PAY-03 | Konfirmasi admin memperbarui baris itu dan menampilkan pilihan pelanggan; metode berbeda wajib beralasan | Metode dipilih dan metode dikonfirmasi sama-sama tersimpan; perbedaan ditandai di detail, daftar, dan laporan |
| FR-PAY-04 | Metode tampil sama di pelanggan, admin, invoice, dan laporan; tanpa teks tetap | Satu pemetaan label; catatan timeline dibuat dari data nyata |
| FR-PAY-05 | Deposit konsisten: online dibayar bersama total, tunai dibayar saat serah terima | Formulir serah terima booking online tidak menanyakan deposit lagi |
| FR-PAY-06 | Bukti bayar opsional; konfirmasi idempotent | Klik ganda satu efek; jumlah wajib sama dengan total yang dibayar; pembayaran paid tidak dikonfirmasi ulang |
| FR-PAY-07 | Invoice terbit saat dikonfirmasi dan kwitansi saat pembayaran dicatat | Nomor unik, tidak berubah setelah terbit; koreksi lewat dokumen baru |

### 7.4 Pembatalan (FR-CAN)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-CAN-01 | Pelanggan dapat membatalkan booking online sebelum membayar | Status pending tanpa pembayaran dan tanpa bukti bayar terkirim |
| FR-CAN-02 | Setelah dibayar, atau setelah bukti bayar terkirim, pelanggan tidak dapat membatalkan | Tombol nonaktif dengan alasan dari server; bukti terkirim mengarahkan ke admin |
| FR-CAN-03 | Booking tunai dapat dibatalkan sampai serah terima | Oleh pelanggan maupun admin |
| FR-CAN-04 | Admin dapat membatalkan booking berbayar dengan alasan dan keputusan refund | Staf tidak dapat membatalkan booking berbayar; tercatat di audit dan timeline |
| FR-CAN-05 | Pembatalan atomik dan idempotent; slot dibebaskan seketika | Pembatalan dan pembayaran paralel menghasilkan satu pemenang; pembayaran yang masuk setelah batal menjadi needs\_refund |
| FR-CAN-06 | Batas penyalahgunaan | Maksimal 1 booking tunai belum diambil dan 3 pembatalan per 30 hari sebelum pelanggan harus menghubungi admin (nilai dari pengaturan) |

### 7.5 Operasional (FR-OPS)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-OPS-01 | Serah terima hanya bila syarat terpenuhi; tombol nonaktif dengan alasan yang terlihat | Syarat: profil lengkap, dokumen terverifikasi dan berlaku, pembayaran lunas (atau tunai dicatat), tanggal dalam rentang sewa |
| FR-OPS-02 | Daftar periksa serah terima kosong secara default; odometer, bensin, kondisi, dan foto (minimal 4 sisi dan odometer) | Foto privat dan hanya dapat ditambah setelah tahap selesai |
| FR-OPS-03 | 'Terima Tunai & Serah Terima' adalah satu transaksi atomik | Gagal di tengah membatalkan semuanya; hasil: pembayaran tunai paid, serah terima tersimpan, status berjalan |
| FR-OPS-04 | Pengembalian mencatat odometer akhir, bensin, biaya kerusakan dan lain-lain, menghitung denda serta deposit | Odometer akhir tidak kurang dari awal; tidak dapat diulang |
| FR-OPS-05 | No-show | Tombol aktif setelah jam ambil ditambah batas tunggu; status dibatalkan dengan alasan no\_show; slot dibebaskan |
| FR-OPS-06 | Deposit dikembalikan ditandai satu kali dengan petugas dan waktu | Idempotent |
| FR-OPS-07 | Booking lama dengan data tidak lengkap diblokir dengan peringatan | Hanya dapat dibatalkan; tidak diubah otomatis |

### 7.6 Armada (FR-AST)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-AST-01 | CRUD motor dan foto | Maksimal 8 foto, satu utama, urutan tersimpan; plat unik |
| FR-AST-02 | Status motor aman terhadap booking | Servis atau nonaktif ditolak bila ada booking pending, dikonfirmasi, atau berjalan yang belum berakhir; daftar penyebab ditampilkan |
| FR-AST-03 | Status servis dihitung server dari tanggal WIB | Terjadwal, Berlangsung, Selesai; selesai lebih awal memendekkan blok dan tercatat |
| FR-AST-04 | Kalender armada | Timeline per motor memuat booking dan servis dengan pengelompokan status yang sama seperti daftar |

### 7.7 Realtime dan sinkronisasi (FR-RT)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-RT-01 | Perubahan data tersiar ke pihak terkait dalam 2 detik | Admin mengonfirmasi pembayaran, layar pelanggan berubah tanpa muat ulang |
| FR-RT-02 | Tidak ada kebocoran antar pengguna | Pelanggan hanya menerima peristiwa miliknya; peristiwa tanpa data pribadi |
| FR-RT-03 | Pemulihan koneksi otomatis dengan indikator status | Sambung ulang bertahap, muat ulang data setelah tersambung, polling cadangan |
| FR-RT-04 | Kontrol konkurensi lewat version | Data usang menghasilkan 409 STALE\_DATA dan halaman diperbarui |
| FR-RT-05 | Tab, lencana, dan hitungan berasal dari server dan identik di admin dan pelanggan | Satu modul pengelompokan status |

### 7.8 Pelacakan GPS (FR-GPS)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-GPS-01 | Satu perangkat terdaftar untuk satu motor | Registrasi, nonaktifkan, dan ganti perangkat tercatat |
| FR-GPS-02 | Penerimaan posisi aman dan idempotent | Data rusak, ganda, atau berurutan terbalik tidak merusak data dan tidak menjatuhkan server |
| FR-GPS-03 | Peta langsung dan riwayat rute untuk admin dan staf | Posisi bergerak tampil realtime; riwayat dapat diputar ulang per rentang waktu |
| FR-GPS-04 | Peringatan: keluar area, offline, daya terputus, gerak tanpa sewa, terlambat kembali | Peringatan terpicu sekali (debounce) dan dapat diakui petugas |
| FR-GPS-05 | Privasi lokasi | Persetujuan pelanggan tercatat, retensi sesuai pengaturan (awal 90 hari), akses hanya admin dan staf, setiap akses dicatat |
| FR-GPS-06 | Simulator untuk pengembangan dan tes | Skenario keluar area, offline, daya terputus, gerak tanpa sewa tersedia |

### 7.9 Admin (FR-ADM)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-ADM-01 | Peran admin dan staf sesuai matriks izin, dibaca dari server | Peran tidak dapat diubah dari klien; admin terakhir tidak dapat dinonaktifkan |
| FR-ADM-02 | Pengaturan dinamis dari database: durasi, denda, batas bayar, jam operasional, kontak, kebijakan | Berlaku tanpa restart; booking lama memakai snapshot; nilai divalidasi; tercatat di audit |
| FR-ADM-03 | Ulasan hanya dapat disembunyikan atau ditampilkan, tidak dihapus | Rating dihitung ulang tanpa ulasan tersembunyi; nama motor asli tampil |
| FR-ADM-04 | Log audit append-only untuk semua aksi mutasi | Audit yang gagal membatalkan perubahan |
| FR-ADM-05 | Laporan dasar dengan ekspor CSV | Definisi pendapatan mengikuti aturan bisnis nomor 7; CSV aman dari formula injection |
| FR-ADM-06 | Pesan kontak | Status baru atau dibalas tersimpan di database |

### 7.10 Antarmuka dan data (FR-UX, FR-DATA)

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-UX-01 | Semua status, label, dan pesan error berbahasa Indonesia, tanpa kode mentah | Pemindaian UI tidak menemukan teks mentah; pesan menyebut langkah berikutnya |
| FR-UX-02 | Satu modul pengelompokan status untuk tab di pelanggan dan admin | Tab: Semua, Menunggu pembayaran, Akan datang, Berjalan, Riwayat; jumlah dari server |
| FR-UX-03 | Satu toast per kegagalan; tombol nonaktif selama proses | Klik ganda menghasilkan satu efek |
| FR-UX-04 | Setiap halaman punya keadaan memuat, kosong, dan galat | Tidak ada layar putih saat database kosong atau backend mati |
| FR-DATA-01 | Data bersih untuk uji nyata | Skrip pembersih dengan pengaman, snapshot dan pemulihan database; seed menolak berjalan di production |

## 8. Mesin Status dan Aturan Bisnis

### 8.1 Status booking

| Status | Arti | Dapat pindah ke | Pemicu |
| --- | --- | --- | --- |
| pending | Menunggu pembayaran (online) atau menunggu serah terima (tunai) | confirmed, active (hanya tunai), cancelled, expired | Pembayaran dikonfirmasi; Terima Tunai & Serah Terima; pembatalan; lewat batas waktu |
| confirmed | Lunas, menunggu pengambilan | active, cancelled | Serah terima; pembatalan oleh admin atau no-show |
| active | Motor sedang dipakai | completed | Pengembalian |
| completed | Selesai | tidak ada |  |
| cancelled | Dibatalkan oleh pelanggan, admin, atau no-show | tidak ada |  |
| expired | Lewat batas waktu bayar atau tidak diambil (tunai) | tidak ada |  |

Transisi di luar tabel ditolak oleh service dan dijaga trigger database. Label di antarmuka: Menunggu pembayaran, Dikonfirmasi, Berjalan, Selesai, Dibatalkan, Kedaluwarsa.

### 8.2 Status pembayaran

| Status | Arti | Dapat pindah ke |
| --- | --- | --- |
| pending | Metode dipilih, belum dibayar | submitted, paid, cancelled, expired |
| submitted | Bukti bayar terkirim, menunggu verifikasi | paid, pending (ditolak dengan catatan) |
| paid | Lunas dan dikonfirmasi | refunded, needs\_refund |
| needs\_refund | Uang masuk tetapi booking tidak dapat dipenuhi, misalnya masuk setelah pembatalan | refunded |
| cancelled, expired, refunded | Akhir | tidak ada |

### 8.3 Status dokumen

| Status | Arti | Dapat pindah ke |
| --- | --- | --- |
| not\_uploaded | Belum diunggah | pending |
| pending | Menunggu verifikasi | verified, rejected |
| verified | Terverifikasi dan berlaku | pending (data atau file diubah), expired |
| rejected | Ditolak dengan alasan | pending (diunggah ulang) |
| expired | SIM atau dokumen kedaluwarsa | pending (diunggah ulang) |

Profil siap sewa bila semua field wajib terisi, semua dokumen verified dan berlaku, dan persetujuan tercatat.

### 8.4 Matriks pembatalan oleh pelanggan

| Situasi | Pelanggan boleh batal? | Catatan |
| --- | --- | --- |
| Online, belum dibayar, belum ada bukti bayar | Ya | Slot dibebaskan seketika |
| Online, bukti bayar terkirim, belum diverifikasi | Tidak | Pelanggan diarahkan menghubungi admin; admin memutuskan |
| Online, sudah dibayar dan dikonfirmasi | Tidak | Hanya admin, dengan alasan dan keputusan refund |
| Tunai, sebelum serah terima | Ya | Oleh pelanggan atau admin |
| Berjalan, selesai, dibatalkan, kedaluwarsa | Tidak | Tidak ada aksi |

Kebijakan ini menggantikan refund bertingkat v1.1 untuk pelanggan. Isinya tertulis di Syarat Sewa dan ditampilkan sebelum pelanggan membayar.

### 8.5 Alur tunai

Booking tunai berstatus pending dan menahan motor sampai jam ambil ditambah batas tunggu (awal 3 jam). Pelanggan atau admin dapat membatalkan sampai serah terima. Saat serah terima, admin menekan satu tombol 'Terima Tunai & Serah Terima': pembayaran tunai (sewa dan deposit) tercatat, serah terima tersimpan, dan status menjadi berjalan, semuanya dalam satu transaksi. Satu pelanggan hanya boleh punya satu booking tunai yang belum diambil.

### 8.6 Aturan bisnis

1. **Semantik tanggal \[ambil, kembali).** Tanggal kembali boleh dipakai sebagai tanggal ambil penyewa lain.
2. **Durasi dan jangka pemesanan.** 1 sampai 30 hari; tanggal ambil tidak lampau (WIB) dan paling jauh 180 hari ke depan; nilai dapat diubah di pengaturan.
3. **Harga.** Dihitung server dari harga motor saat itu dalam Rupiah bulat, lalu disimpan sebagai snapshot.
4. **Rincian.** Total sewa, Deposit, dan Total yang dibayar (sewa ditambah deposit).
5. **Deposit.** Online dibayar bersama total; tunai dibayar saat serah terima; dikembalikan setelah pengembalian dikurangi potongan (denda, kerusakan, biaya lain); kelebihan potongan menjadi kurang bayar.
6. **Denda keterlambatan.** Jadwal kembali = tanggal kembali pada jam ambil (WIB). Toleransi awal 2 jam; selebihnya per jam dibulatkan ke atas; denda per jam = harga harian dikali persen (awal 10%); per 24 jam keterlambatan tidak melebihi harga harian.
7. **Pendapatan.** Total sewa dikurangi refund ditambah denda, biaya kerusakan, dan biaya lain. Deposit bukan pendapatan. Diakui pada tanggal pembayaran (WIB).
8. **Ketersediaan atomik.** Exclusion constraint di database ditambah kunci per motor yang sama dipakai pembuatan booking dan blok servis.
9. **Kelayakan penyewa.** Profil lengkap dan dokumen terverifikasi diperiksa saat booking, konfirmasi pembayaran, dan serah terima; SIM berlaku sampai setelah tanggal kembali; usia di atas minimum (awal 18 tahun).
10. **Batas waktu.** Online 60 menit; tunai sampai jam ambil ditambah 3 jam. Keduanya dari pengaturan.
11. **Batas penyalahgunaan.** Maksimal 1 booking tunai belum diambil per pelanggan dan 3 pembatalan dalam 30 hari.
12. **Admin terakhir.** Tidak dapat dinonaktifkan atau diturunkan; peran dibaca dari server pada setiap permintaan.
13. **Pengaturan dinamis dan snapshot.** Nilai di database menang atas konfigurasi bawaan; booking menyimpan aturan yang berlaku saat dibuat.
14. **Kode booking.** RM-YYMMDD-XXXX, unik.
15. **No-show.** Batas tunggu awal 3 jam; kebijakan refund awal: sewa tidak dikembalikan, deposit dikembalikan penuh (menunggu konfirmasi pemilik).
16. **Foto kondisi.** Minimal empat sisi dan odometer pada serah terima dan pengembalian; privat; hanya dapat ditambah.
17. **Persetujuan.** Versi Syarat Sewa, Kebijakan Privasi, dan persetujuan GPS tersimpan per booking.
18. **Dokumen keuangan.** Invoice dan kwitansi bernomor unik dan tidak berubah setelah terbit.

## 9. Standar Data Penyewa

Data ini disimpan sekali di profil pelanggan, menjadi satu-satunya sumber untuk dasbor pelanggan dan panel admin, lalu disalin sebagai snapshot ke setiap booking.

| Kelompok | Field | Wajib | Validasi dan penyimpanan |
| --- | --- | :-: | --- |
| Identitas | Nama lengkap sesuai KTP | ✔ | Minimal dua kata, tanpa angka; dicocokkan dengan KTP saat verifikasi |
|  | Nomor KTP | ✔ | 16 digit; disimpan sebagai HMAC-SHA256 plus empat digit terakhir; satu KTP satu akun terverifikasi |
|  | Tanggal lahir | ✔ | Usia minimal sesuai pengaturan (awal 18 tahun) |
|  | Alamat sesuai KTP | ✔ | Teks, panjang wajar |
| Kontak | Nomor WhatsApp aktif | ✔ | Format +62 valid |
|  | Email | ✔ | Terverifikasi lewat tautan |
|  | Alamat tinggal atau penginapan selama sewa | ✔ | Teks |
| Kontak darurat | Nama, hubungan (pilihan), nomor HP | ✔ | Nomor tidak boleh sama dengan nomor penyewa |
| Dokumen | Foto KTP | ✔ | jpg/png/webp, maksimal 2 MB, magic bytes; penyimpanan privat |
|  | Foto SIM C dan masa berlaku | ✔ | Berlaku sampai setelah tanggal kembali booking |
|  | Selfie memegang KTP | ✔ | Wajib selama pengaturan REQUIRE\_SELFIE aktif (awal aktif) |
| Persetujuan | Syarat Sewa, Kebijakan Privasi, pelacakan GPS | ✔ | Versi, waktu, dan IP tercatat |

**Aturan tampilan.** Admin dan pelanggan memakai label dan format yang sama; field kosong tampil 'Belum diisi' berwarna merah; hanya empat digit terakhir KTP yang tampil; dokumen hanya dapat dibuka admin dan staf lewat tampilan privat, dan setiap akses dicatat.

## 10. Sinkronisasi Realtime dan Konsistensi

Perubahan di satu sisi tampil di sisi lain dalam 2 detik: server memberi tahu bahwa data berubah, lalu klien mengambil data terbaru lewat API biasa yang memeriksa izin.

1. **Saluran.** Server-Sent Events dengan tiket sekali pakai berumur 30 detik.
2. **Isi peristiwa.** Jenis, id, dan version, tanpa data pribadi. Jenis: booking.updated, payment.updated, document.updated, motor.availability.changed, counters.changed, message.new, settings.changed, serta gps.position dan gps.alert untuk admin.
3. **Pengiriman setelah commit.** Peristiwa ditulis dalam transaksi yang sama (outbox) dan dikirim setelah commit; klien yang terputus menerima peristiwa terlewat lewat Last-Event-ID (retensi 24 jam).
4. **Pemisahan saluran.** Pelanggan hanya menerima peristiwa miliknya; admin dan staf sesuai peran.
5. **Ketahanan.** Heartbeat berkala, sambung ulang bertahap, muat ulang data setelah tersambung, polling cadangan bila stream terblokir, indikator status koneksi, batas koneksi per pengguna, tidak crash saat klien memutus koneksi.
6. **Konsistensi.** Kolom version pada booking, pembayaran, dan dokumen; aksi menyertakan version terakhir yang dilihat klien; ketidakcocokan menghasilkan 409 STALE\_DATA.
7. **Ketersediaan publik.** Booking baru, pembatalan, atau blok servis memicu motor.availability.changed sehingga daftar, detail, dan kalender tanggal terisi diperbarui.
8. **Kemampuan dari server.** API mengirim capabilities (boleh batal, boleh bayar, boleh serah terima) beserta alasan dalam Bahasa Indonesia; UI hanya menampilkannya.

## 11. Pelacakan GPS

GPS dibangun dua tahap karena pelacakan nyata memerlukan alat pelacak di tiap motor (dengan kartu data) dan server yang dapat dijangkau alat itu. Rilis 1 membangun fondasi dengan simulator; rilis 2 menyambungkan alat nyata.

- **Rilis 1:** tabel perangkat, posisi, area (geofence), dan peringatan; antarmuka penyedia yang dapat diganti (simulator, Traccar, webhook generik); penerimaan posisi yang aman; peta langsung dan riwayat rute di panel admin; peringatan; simulator.
- **Rilis 2:** sambungkan alat nyata lewat Traccar atau API vendor; uji pilot pada 2 sampai 3 motor; sesuaikan ambang peringatan dengan kondisi lapangan.
- **Peringatan:** keluar dari area yang berlaku, kecepatan melebihi batas, tidak ada sinyal melebihi batas menit, baterai rendah, daya terputus, motor bergerak atau mesin menyala saat tidak ada booking berjalan (indikasi pencurian), motor masih berjalan melewati tanggal kembali.
- **Privasi:** pelanggan menyetujui pelacakan di Syarat Sewa; peta dan data lokasi hanya untuk admin dan staf; retensi awal 90 hari dengan job pembersih; sisi pelanggan hanya menampilkan pemberitahuan bahwa motor dilengkapi GPS.
- **Di luar lingkup:** pemutus mesin jarak jauh.

## 12. Persyaratan Non-Fungsional

| Aspek | Persyaratan |
| --- | --- |
| Keandalan | Tidak crash pada input sembarang; error terpusat berpesan Indonesia; shutdown aman; koneksi database pulih otomatis; operasi idempotent |
| Konsistensi data | Transaksi untuk operasi multi-tabel; CHECK, UNIQUE, FK, dan exclusion constraint; trigger transisi status; skrip verifikasi integritas |
| Keamanan | Hash sandi bcrypt; JWT; peran dari server; rate limit; validasi dan sanitasi input; query terparameter; CORS terbatas; unggahan divalidasi magic bytes; HTTPS di production |
| Kinerja | Endpoint utama p95 maksimal 300 ms pada 10.000 booking; LCP di bawah 2,5 detik di mobile; pagination dan lazy loading |
| Realtime | Latensi p95 maksimal 2 detik; pemulihan otomatis; tanpa kebocoran memori |
| Aksesibilitas dan UX | Mobile-first 360 sampai 1440 px; kontras WCAG AA; navigasi keyboard; satu aksi utama per layar; Bahasa Indonesia |
| Observabilitas | Log terstruktur dengan requestId; endpoint kesehatan memuat status database; audit aksi admin |
| Pemeliharaan | Controller, service, dan repository terpisah; kontrak API terdokumentasi; migrasi berurutan dengan checksum |
| Cadangan | Backup database terenkripsi di luar server dan uji pemulihan berkala (saat deployment) |
| Kompatibilitas | Chrome, Safari, Firefox, Edge versi terbaru |

## 13. Keamanan dan Privasi Data

Sistem memproses identitas, dokumen, kontak, dan lokasi, yang semuanya data pribadi menurut UU Pelindungan Data Pribadi.

- Dasar pengolahan: persetujuan tercatat dan kebutuhan pelaksanaan perjanjian sewa.
- Nomor KTP tidak disimpan utuh; foto dokumen disimpan privat di luar folder yang dilayani web; setiap akses dokumen dan lokasi dicatat.
- Masa simpan ditetapkan per jenis data (dokumen dan lokasi) dan dibersihkan otomatis; pelanggan dapat meminta penghapusan data sesuai ketentuan.
- Akun admin: sandi minimal 12 karakter, pembatasan percobaan login, sesi pendek (awal 8 jam), semua login tercatat; 2FA di rilis 2.
- Data kartu pembayaran tidak disimpan; pembayaran nyata melalui gateway di rilis 2.
- Teks Syarat Sewa dan Kebijakan Privasi ditinjau penasihat hukum sebelum peluncuran.

## 14. Strategi Kualitas dan Gerbang Rilis

Cacat v1.x lolos karena sistem diuji per halaman, bukan per aturan. Versi 2.0 menguji aturan bisnis dari API sampai database, lalu alur lengkap di browser.

| Lapis | Isi | Gerbang |
| --- | --- | --- |
| Unit dan integrasi | Harga, ketersediaan, transisi status, denda, deposit, validasi, kemampuan (capabilities) | Semua lulus; cakupan services minimal 85% |
| Kontrak API | Bentuk respons terhadap dokumen kontrak | Tanpa selisih |
| Konkurensi (PostgreSQL nyata) | 20 booking paralel pada satu slot; booking melawan servis; pembatalan melawan pembayaran; serah terima ganda; promo batas 1; admin terakhir | Nol double booking, tanpa deadlock, diulang 5 kali |
| Keamanan | Matriks otorisasi per rute dan peran; injeksi; unggahan; kebocoran antar pengguna di realtime | Nol pelanggaran |
| Integritas data | db:verify dan kueri invarian setelah tiap skenario | Bersih |
| E2E browser (Playwright, PostgreSQL asli) | Siklus lengkap dari pelanggan baru sampai deposit; setiap sel matriks pembatalan; tunai, QRIS, transfer, e-wallet tampil sama di admin; data identik; database kosong | Hijau dua kali berturut-turut |
| Realtime | Dua konteks browser, jaringan terputus, backend dimulai ulang | 2 detik atau kurang; pulih otomatis |
| Performa | 10.000 booking sintetis | p95 maksimal 300 ms |
| Aksesibilitas | axe-core pada halaman utama | Nol pelanggaran serius |
| Uji lapangan | 3 sampai 5 pengguna nyata (tanpa dokumen asli selama sistem masih lokal) | Masalah utama diperbaiki |

### Gerbang rilis

- [ ] Semua tes otomatis hijau dua kali berturut-turut
- [ ] 16 cacat D-01 sampai D-16 lulus tes penerimaannya
- [ ] Audit keterhubungan 100%: tidak ada data mock atau hardcode di jalur produksi
- [ ] Database bersih lolos db:verify; seed menolak berjalan di production
- [ ] Siklus lengkap diuji untuk setiap metode pembayaran
- [ ] Nol cacat berstatus kritis atau tinggi yang terbuka
- [ ] Syarat Sewa dan Kebijakan Privasi final dan ditinjau penasihat hukum
- [ ] Backup dan uji pemulihan berjalan (saat deployment)

## 15. Rencana Rilis dan Estimasi

Perencanaan dimulai dari kondisi saat ini: sebagian besar antarmuka sudah ada, sehingga pekerjaan utamanya perbaikan, penegakan aturan, dan pengujian. Estimasi mengasumsikan satu pengembang dengan bantuan AI coding dan dapat bergeser sesuai waktu dan kualitas hasil tiap tahap. Satu sprint selesai hanya bila tes terkaitnya lulus.

| Sprint | Cakupan | Persyaratan | Estimasi |
| --- | --- | --- | --- |
| S0 | Stabilisasi dan data bersih: perbaikan cacat kritis, skrip pembersih, snapshot database, audit keterhubungan | FR-DATA-01, FR-UX-01, FR-ID-05, FR-ID-06 | 1 sampai 1,5 minggu |
| S1 | Identitas dan profil penyewa, dokumen, booking dari profil | FR-ID-01 sampai 10, FR-BKG-02 | 1,5 sampai 2 minggu |
| S2 | Pembayaran dan pembatalan, alur tunai, rincian harga | FR-PAY, FR-CAN, FR-BKG-04 dan 05 | 1,5 sampai 2 minggu |
| S3 | Operasional: serah terima, foto, pengembalian, no-show, booking manual, servis | FR-OPS, FR-AST-02 dan 03, FR-BKG-07 | 1,5 sampai 2 minggu |
| S4 | Realtime dan sinkronisasi, tab dan lencana | FR-RT, FR-UX-02 dan 03 | 1 sampai 1,5 minggu |
| S5 | GPS fondasi dengan simulator | FR-GPS | 1 sampai 1,5 minggu |
| S6 | Pengujian menyeluruh dan uji lapangan | Gerbang rilis | 1,5 sampai 2 minggu |
| S7 | Deployment dan soft launch (server terakhir); pilot perangkat GPS masuk rilis 2 | Bagian 14 | 0,5 sampai 1 minggu |

Total rilis 1: sekitar 10 sampai 14 minggu. Setelah soft launch 2 sampai 4 minggu, tentukan prioritas rilis 2 berdasarkan data nyata.

## 16. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Double booking pada pemesanan bersamaan | Pelanggan kecewa, reputasi turun | Exclusion constraint, kunci per motor, uji konkurensi wajib |
| Kebocoran data identitas dan lokasi | Risiko hukum dan reputasi | Penyimpanan privat, hash KTP, akses tercatat, retensi, tinjauan hukum |
| Cacat berulang karena aturan tersebar di UI dan server | Hasil seperti v1.x terulang | Prinsip 1 sampai 3, capabilities dari server, uji kontrak |
| Hasil AI coding tidak konsisten | Jadwal molor, bug logika | Satu masalah per percakapan, tes regresi tiap perbaikan, commit per tahap, tinjauan kode untuk booking, transaksi, dan pembayaran |
| Pembayaran manual lambat atau salah cocok | Booking kedaluwarsa, pelanggan hilang | Bukti bayar, jumlah wajib sama, instruksi jelas, gateway di rilis 2 |
| Booking tunai menahan motor tanpa komitmen | Pendapatan hilang | Maksimal 1 booking tunai belum diambil, kedaluwarsa setelah jam ambil, batas pembatalan |
| Kebijakan tidak bisa batal setelah bayar memicu sengketa | Keluhan dan perselisihan | Tertulis di Syarat Sewa, ditampilkan sebelum bayar, persetujuan tercatat, admin dapat menangani kasus khusus |
| Alat GPS belum tersedia atau sinyal buruk | Pelacakan tidak berfungsi | Simulator lebih dulu, pilot 2 sampai 3 motor, ambang peringatan toleran |
| Realtime tidak stabil | Data tampak usang | Version, replay peristiwa, polling cadangan, uji jaringan terputus |
| Lingkup membesar | MVP tertunda | Rilis 1 hanya item bertanda ✔; sisanya rilis 2 dan 3 |
| Kehilangan data karena satu server | Layanan mati dan data hilang | Backup terenkripsi di luar server dan uji pemulihan saat deployment |

## 17. Keputusan dan Asumsi

Nilai awal dipakai agar pengembangan tidak berhenti; ubah bila tidak sesuai.

| Keputusan | Nilai awal | Status |
| --- | --- | --- |
| Kebijakan pembatalan (bagian 8.4) | Batal sebelum bayar; tidak setelah bayar; tunai sampai serah terima | Ditetapkan pemilik |
| Waktu deployment server | Setelah semua gerbang kualitas | Ditetapkan pemilik |
| Pembayaran rilis 1 | Manual (transfer, QRIS, e-wallet) dan tunai; gateway di rilis 2 | Perlu konfirmasi |
| Deposit | Online dibayar bersama total; tunai saat serah terima | Perlu konfirmasi |
| Batas tunggu tunai dan no-show | 3 jam | Perlu konfirmasi |
| Refund no-show | Sewa tidak dikembalikan, deposit dikembalikan penuh | Perlu konfirmasi |
| Batas booking tunai belum diambil dan pembatalan per 30 hari | 1 dan 3 | Perlu konfirmasi |
| Selfie memegang KTP | Wajib | Perlu konfirmasi |
| Penyewa WNA | Tidak (rilis 3) | Perlu konfirmasi |
| Usia minimum penyewa | 18 tahun | Perlu konfirmasi |
| Retensi data lokasi GPS | 90 hari | Perlu konfirmasi |
| Persen denda dan toleransi keterlambatan | 10% per jam dan 2 jam | Perlu konfirmasi |
| Nilai deposit per motor | Diisi pemilik saat input armada | Terbuka |
| Perangkat GPS (merek, model, kartu data) | Belum dipilih | Terbuka |
| Penyedia email transaksional dan domain pengirim | Belum dipilih | Terbuka |

## 18. Riwayat Revisi

| Versi | Tanggal | Perubahan |
| --- | --- | --- |
| 2.0 | 25 Okt 2026 | Disusun ulang dari hasil uji nyata v1.x: keterlacakan 16 cacat, prinsip desain, standar data penyewa, mesin status, kebijakan pembatalan baru, realtime, GPS bertahap, gerbang kualitas, rencana rilis dari kondisi saat ini |
| 1.1 | 22 Okt 2026 | Menutup celah operasional: booking manual, no-show, foto kondisi, persetujuan syarat, invoice, email, validasi dokumen, keamanan admin |
| 1.0 | 22 Okt 2026 | Draf awal |
