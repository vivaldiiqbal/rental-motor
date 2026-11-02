/**
 * Konten default NETRAL untuk halaman, content block, dan FAQ.
 *
 * Prinsip: nilai di database selalu menang. File ini HANYA dipakai sebagai
 * fallback bila tabel kosong / data belum diatur / data rusak, sehingga halaman
 * publik tidak pernah crash atau kosong.
 *
 * Body memakai Markdown. Placeholder {{nama}} diganti saat render dari
 * pengaturan terbaru (lihat utils/markdown.js -> PLACEHOLDER_KEYS).
 */

const PAGE_SLUGS = ['terms', 'privacy', 'how-it-works', 'about'];

const DEFAULT_PAGES = {
  terms: {
    title: 'Syarat dan Ketentuan',
    body: [
      'Harap baca ketentuan berikut sebelum menyewa motor di {{brandName}}.',
      '',
      '## Persyaratan penyewa',
      '',
      '- Usia minimal {{minRenterAge}} tahun',
      '- Membawa KTP asli',
      '- Membawa SIM C yang masih berlaku',
      '',
      '## Durasi dan pembayaran',
      '',
      'Durasi sewa minimal {{minDays}} hari dan maksimal {{maxDays}} hari per pemesanan. Pembayaran dilakukan sesuai metode yang dipilih saat pemesanan, dan harus diselesaikan dalam {{bookingExpireMinutes}} menit setelah pemesanan dibuat.',
      '',
      '## Deposit',
      '',
      'Deposit dibayarkan saat pengambilan motor dan dikembalikan setelah motor dikembalikan dalam kondisi baik.',
      '',
      '## Keterlambatan',
      '',
      'Keterlambatan pengembalian dikenakan denda {{lateFeePercentPerHour}}% dari harga sewa harian untuk setiap jam keterlambatan, setelah toleransi {{lateFeeToleranceMinutes}} menit.',
      '',
      '## Pembatalan',
      '',
      '{{cancellationPolicy}}',
      '',
      '## Kerusakan dan kehilangan',
      '',
      'Penyewa bertanggung jawab atas kerusakan, kehilangan, dan pelanggaran lalu lintas selama masa sewa.',
    ].join('\n'),
  },
  privacy: {
    title: 'Kebijakan Privasi',
    body: [
      '{{brandName}} menghargai privasi Anda dan hanya memakai data seperlunya untuk layanan sewa.',
      '',
      '## Data yang kami kumpulkan',
      '',
      'Nama, kontak, nomor identitas, dokumen KTP/SIM, serta riwayat pemesanan yang Anda berikan saat memakai layanan.',
      '',
      '## Penggunaan data',
      '',
      'Data dipakai untuk memproses pemesanan, verifikasi identitas, komunikasi terkait booking, dan peningkatan layanan.',
      '',
      '## Penyimpanan dan keamanan',
      '',
      'Kami menjaga data dengan langkah keamanan yang wajar. Data tidak dijual kepada pihak ketiga.',
      '',
      '## Hak Anda',
      '',
      'Anda dapat meminta akses, perbaikan, atau penghapusan data dengan menghubungi kami di {{contactEmail}}.',
    ].join('\n'),
  },
  'how-it-works': {
    title: 'Cara Sewa',
    body: [
      'Lima langkah sederhana dari memilih motor sampai berangkat.',
      '',
      '1. **Pilih motor** - Jelajahi daftar motor, gunakan filter, dan bandingkan pilihan.',
      '2. **Tentukan tanggal** - Pilih tanggal ambil dan kembali. Harga total langsung dihitung.',
      '3. **Isi data dan konfirmasi** - Lengkapi data penyewa, pilih pembayaran, lalu konfirmasi pesanan.',
      '4. **Bayar** - Selesaikan pembayaran sesuai metode yang dipilih.',
      '5. **Ambil motor** - Tunjukkan kode booking, KTP, dan SIM saat pengambilan.',
      '',
      '## Persyaratan',
      '',
      '- Usia minimal {{minRenterAge}} tahun',
      '- KTP asli',
      '- SIM C yang masih berlaku',
      '',
      'Butuh bantuan? Hubungi kami di WhatsApp {{whatsappNumber}} pada jam operasional {{operatingHours}}.',
    ].join('\n'),
  },
  about: {
    title: 'Tentang Kami',
    body: [
      '{{brandName}} hadir agar menyewa motor semudah memesan tiket. Kami percaya perjalanan yang baik dimulai dari proses sewa yang jelas: harga transparan, motor terawat, dan pelayanan yang ramah.',
      '',
      '## Aman dan terpercaya',
      '',
      'Setiap motor dicek sebelum disewakan dan dilengkapi helm.',
      '',
      '## Terawat rutin',
      '',
      'Servis berkala agar nyaman dan aman di perjalanan.',
      '',
      '## Pelayanan ramah',
      '',
      'Tim kami siap membantu selama jam operasional {{operatingHours}}.',
    ].join('\n'),
  },
};

const DEFAULT_BLOCKS = {
  heroTitle: 'Sewa motor mudah, harga jelas',
  heroSubtitle: 'Pilih motor, tentukan tanggal, dan berangkat. Tanpa biaya tersembunyi.',
  ctaText: 'Lihat motor',
  announcement: {
    isActive: false,
    text: '',
    linkUrl: '',
    linkLabel: '',
    startsAt: null,
    endsAt: null,
  },
};

const BLOCK_KEYS = Object.keys(DEFAULT_BLOCKS);

const TEXT_LIMITS = { heroTitle: 120, heroSubtitle: 300, ctaText: 40 };

function isSafeLink(url) {
  if (url === '' || url === null || url === undefined) return true;
  if (typeof url !== 'string' || url.length > 500) return false;
  return /^https?:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'));
}

function parseDateOrNull(v, label) {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  const t = new Date(v);
  if (typeof v !== 'string' || Number.isNaN(t.getTime())) {
    return { ok: false, error: `${label} bukan tanggal yang valid` };
  }
  return { ok: true, value: t.toISOString() };
}

/**
 * Validasi nilai content block per kunci.
 * @returns {{ok: true, value: any} | {ok: false, error: string}}
 */
function validateBlockValue(key, value) {
  if (!BLOCK_KEYS.includes(key)) {
    return { ok: false, error: `Kunci content block tidak dikenal: ${key}` };
  }

  if (TEXT_LIMITS[key]) {
    if (typeof value !== 'string') return { ok: false, error: `${key} harus berupa teks` };
    const v = value.trim();
    if (!v || v.length > TEXT_LIMITS[key]) {
      return { ok: false, error: `${key} harus 1 sampai ${TEXT_LIMITS[key]} karakter` };
    }
    return { ok: true, value: v };
  }

  // announcement
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'announcement harus berupa objek' };
  }
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  const isActive = value.isActive === true;
  if (text.length > 300) return { ok: false, error: 'Teks pengumuman maksimal 300 karakter' };
  if (isActive && !text) return { ok: false, error: 'Teks pengumuman wajib diisi bila diaktifkan' };

  const linkUrl = typeof value.linkUrl === 'string' ? value.linkUrl.trim() : '';
  if (!isSafeLink(linkUrl)) {
    return { ok: false, error: 'Tautan pengumuman harus diawali http(s):// atau / (path relatif)' };
  }
  const linkLabel = typeof value.linkLabel === 'string' ? value.linkLabel.trim() : '';
  if (linkLabel.length > 60) return { ok: false, error: 'Label tautan maksimal 60 karakter' };

  const s = parseDateOrNull(value.startsAt, 'startsAt');
  if (!s.ok) return s;
  const e = parseDateOrNull(value.endsAt, 'endsAt');
  if (!e.ok) return e;
  if (s.value && e.value && new Date(s.value) > new Date(e.value)) {
    return { ok: false, error: 'startsAt tidak boleh setelah endsAt' };
  }

  return {
    ok: true,
    value: { isActive, text, linkUrl, linkLabel, startsAt: s.value, endsAt: e.value },
  };
}

module.exports = {
  PAGE_SLUGS,
  DEFAULT_PAGES,
  DEFAULT_BLOCKS,
  BLOCK_KEYS,
  validateBlockValue,
};
