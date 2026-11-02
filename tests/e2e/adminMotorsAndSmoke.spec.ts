import { test, expect } from '@playwright/test';
import type { Client } from 'pg';
import { API, connectDb, reseed, adminAuth } from './helpers';

test.describe('Tahap 3 & Uji Asap Regresi: Armada Motor (/admin/motors) + Seluruh Halaman', () => {
  let db: Client;

  test.beforeAll(async () => {
    db = await connectDb();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test.beforeEach(async ({ request }) => {
    await reseed(request);
  });

  test('1. Admin & Staff di /admin/motors: plat lengkap, status Bahasa Indonesia, status GPS, 0 toast, 0 console error, tambah motor baru muncul di daftar', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    // A. Login sebagai Admin
    await page.goto('/admin/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    // Buka /admin/motors
    await page.goto('/admin/motors');
    await expect(page.locator('h1').filter({ hasText: /Armada Motor/i })).toBeVisible({ timeout: 10000 });

    // Verifikasi plat nomor lengkap tampil (bukan "-" dan bukan "***")
    await expect(page.getByText('DK 1234 RK')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('DK 2345 RK')).toBeVisible();
    await expect(page.getByText('DK 3456 RK')).toBeVisible();

    // Verifikasi status Bahasa Indonesia tampil
    await expect(page.getByText('Tersedia').first()).toBeVisible();
    await expect(page.getByText('Servis').first()).toBeVisible();

    // Verifikasi status GPS tampil ("Belum ada alat GPS" untuk motor tanpa GPS, "Offline"/"Online" untuk yang punya)
    await expect(page.getByText('Belum ada alat GPS').first()).toBeVisible();

    // Verifikasi 0 toast error ("Data motor tidak ditemukan" tidak boleh muncul)
    await expect(page.getByText(/Data motor tidak ditemukan/i)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);

    // B. Tambah motor baru melalui form /admin/motors/new
    await page.getByRole('link', { name: /Tambah Motor/i }).click();
    await expect(page.locator('h1').filter({ hasText: /Tambah Unit Motor Baru/i })).toBeVisible();

    await page.getByPlaceholder(/Contoh: Honda Vario 160 ABS/i).fill('Honda Stylo 160 CBS Baru');
    await page.getByPlaceholder(/Contoh: B 4567 KLA/i).fill('DK 8899 ST');
    await page.getByRole('button', { name: /Terbitkan Unit Motor/i }).click();

    await page.waitForURL((url) => url.pathname === '/admin/motors', { timeout: 10000 });
    // Karena paginasi 10 baris per halaman dan ini motor ke-15, cari dengan filter pencarian atau pindah ke halaman 2
    await page.getByPlaceholder(/Cari nama motor atau plat nomor/i).fill('DK 8899 ST');
    await expect(page.getByRole('cell', { name: /Honda Stylo 160 CBS Baru/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: 'DK 8899 ST' })).toBeVisible();

    // C. Login sebagai Staff dan verifikasi akses baca /admin/motors
    await page.evaluate(() => localStorage.clear());
    await page.goto('/admin/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('staff@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Staff12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    await page.goto('/admin/motors');
    await expect(page.locator('h1').filter({ hasText: /Armada Motor/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('DK 1234 RK')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Tersedia').first()).toBeVisible();
    // Staff tidak boleh melihat tombol Tambah Motor
    await expect(page.getByRole('link', { name: /Tambah Motor/i })).toHaveCount(0);
    await expect(page.getByText(/Data motor tidak ditemukan/i)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('2. Jumlah permintaan jaringan tetap (bebas N+1) saat memuat 5 motor maupun 50 motor', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    // Skenario A: Hanya 5 motor di database
    await db.query('TRUNCATE TABLE payments, bookings CASCADE');
    await db.query('DELETE FROM motorcycles WHERE id > 5');
    const apiRequests5: string[] = [];
    const listener5 = (req: any) => {
      const url = req.url();
      if (url.includes('/api/admin/motorcycles')) {
        apiRequests5.push(`${req.method()} ${new URL(url).pathname}`);
      }
    };
    page.on('request', listener5);
    await page.goto('/admin/motors?limit=50');
    await expect(page.getByText('DK 1234 RK')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(400);
    page.off('request', listener5);

    // Skenario B: 50 motor di database
    for (let i = 6; i <= 50; i++) {
      await db.query(
        `INSERT INTO motorcycles (id, slug, name, brand, type, cc, year, color, transmission, fuel_capacity, plate_number, price_per_day, deposit, status)
         VALUES ($1, $2, $3, 'Honda', 'matic', 125, 2024, 'Hitam', 'Otomatis', 5.5, $4, 95000, 200000, 'active')
         ON CONFLICT (id) DO NOTHING`,
        [i, `motor-uji-${i}`, `Motor Uji ${i}`, `DK ${7000 + i} UJ`],
      );
    }

    const apiRequests50: string[] = [];
    const listener50 = (req: any) => {
      const url = req.url();
      if (url.includes('/api/admin/motorcycles')) {
        apiRequests50.push(`${req.method()} ${new URL(url).pathname}`);
      }
    };
    page.on('request', listener50);
    await page.reload();
    await expect(page.getByText('DK 1234 RK')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(400);
    page.off('request', listener50);

    // Jumlah request tetap konstan (1 GET daftar, atau 2 pada React StrictMode dev), tidak bertambah seiring jumlah motor!
    expect(apiRequests5.length).toBeGreaterThanOrEqual(1);
    expect(apiRequests5.length).toBeLessThanOrEqual(2);
    expect(apiRequests50.length).toBe(apiRequests5.length);
  });

  test('3. Keadaan kosong, plat kosong ("Belum diisi"), kegagalan backend ("Coba lagi" tanpa toast), dan satu toast saat aksi pengguna gagal', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    // A. Kosongkan plat motor #1 di DB -> harus tampil "Belum diisi" berwarna merah dan 0 toast
    await db.query("UPDATE motorcycles SET plate_number = '' WHERE id = 1");
    await page.goto('/admin/motors');
    const belumDiisi = page.getByText('Belum diisi').first();
    await expect(belumDiisi).toBeVisible({ timeout: 10000 });
    await expect(belumDiisi).toHaveClass(/text-rose-600/);
    await expect(page.locator('[role="status"]')).toHaveCount(0);

    // B. Database kosong -> tampil empty state ("Unit motor tidak ditemukan") tanpa toast error
    await db.query('TRUNCATE TABLE motorcycles CASCADE');
    await page.reload();
    await expect(page.getByText(/Unit motor tidak ditemukan/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="status"]')).toHaveCount(0);

    // C. Backend gagal saat memuat halaman -> tampil keadaan galat dengan tombol "Coba lagi" dan 0 toast
    await page.route('**/api/admin/motorcycles*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Gagal terhubung ke server armada.' }),
      }),
    );
    await page.reload();
    const retryBtn = page.getByRole('button', { name: /Coba lagi/i });
    await expect(retryBtn).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Gagal terhubung ke server armada/i)).toBeVisible();
    // Tidak boleh ada toast untuk pemuatan latar belakang
    await expect(page.locator('[role="status"]')).toHaveCount(0);

    await page.unroute('**/api/admin/motorcycles*');

    // D. Satu toast saat aksi pengguna gagal (simpan motor gagal -> tepat 1 toast)
    await page.route('**/api/admin/motorcycles', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Gagal menyimpan unit motor ke database.' }),
        });
      }
      return route.continue();
    });
    await page.goto('/admin/motors/new');
    await page.getByPlaceholder(/Contoh: Honda Vario 160 ABS/i).fill('Motor Gagal Simpan');
    await page.getByPlaceholder(/Contoh: B 4567 KLA/i).fill('DK 9900 ER');
    await page.getByRole('button', { name: /Terbitkan Unit Motor/i }).click();
    await expect(page.getByText(/Gagal menyimpan unit motor ke database/i)).toHaveCount(1);
    await page.unroute('**/api/admin/motorcycles');
  });

  test('4. Realtime SSE: mengubah status motor via API memperbarui baris di /admin/motors dalam < 2 detik tanpa reload', async ({ page, request }) => {
    const admin = await adminAuth(request);

    await page.goto('/admin/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    await page.goto('/admin/motors?search=DK+1234+RK');
    await expect(page.getByText('DK 1234 RK')).toBeVisible({ timeout: 10000 });
    const row = page.locator('tr').filter({ hasText: 'DK 1234 RK' });
    await expect(row.getByText('Tersedia')).toBeVisible();

    // Tunggu sebentar agar koneksi SSE aktif
    await page.waitForTimeout(600);

    // Ubah status motor #1 menjadi 'inactive' dari luar jendela (via API)
    const patchRes = await request.patch(`${API}/admin/motorcycles/1/status`, {
      headers: admin.headers,
      data: { status: 'inactive' },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Dalam <= 2 detik baris motor #1 harus berubah menjadi "Nonaktif" tanpa page reload!
    await expect(row.getByText('Nonaktif')).toBeVisible({ timeout: 2500 });
  });

  test('5. UJI ASAP REGRESI: Seluruh halaman publik dan panel admin dimuat tanpa toast error dan tanpa console error', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[${page.url()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`[${page.url()}] ${e.message}`));

    // --- 1. HALAMAN PUBLIK ---
    const publicPages = [
      { name: 'Beranda', path: '/', expectText: /RodaKita|Sewa Motor/i },
      { name: 'Daftar Motor Katalog', path: '/motors', expectText: /Honda Beat|Honda Vario/i },
      { name: 'Detail Motor', path: '/motors/honda-beat', expectText: /Honda Beat/i },
    ];

    for (const p of publicPages) {
      await page.goto(p.path);
      await expect(page.getByText(p.expectText).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Data motor tidak ditemukan/i)).toHaveCount(0);
    }

    // Login sebagai pelanggan untuk menguji alur Booking ke Pembayaran, Booking Saya, & Profil
    await page.goto('/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('demo@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Demo12345');
    await page.getByRole('button', { name: /^Masuk$/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    await page.goto('/booking/honda-beat');
    await expect(page.getByText(/Honda Beat/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Data motor tidak ditemukan/i)).toHaveCount(0);

    await page.goto('/bookings');
    await expect(page.locator('h1, h2').filter({ hasText: /Booking|Pesanan/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Data motor tidak ditemukan/i)).toHaveCount(0);

    await page.goto('/profile');
    await expect(page.getByText(/Ilham Ramadhan|Profil/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Data motor tidak ditemukan/i)).toHaveCount(0);

    // --- 2. PANEL ADMIN ---
    await page.evaluate(() => localStorage.clear());
    await page.goto('/admin/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    const adminPages = [
      { name: 'Dashboard Admin', path: '/admin', expectText: /Dashboard|Ringkasan/i },
      { name: 'Transaksi Booking', path: '/admin/bookings', expectText: /Transaksi|Booking/i },
      { name: 'Detail Booking (Konfirmasi & Serah Terima)', path: '/admin/bookings/1', expectText: /RK-|RM-|Detail|Pembayaran/i },
      { name: 'Armada Motor', path: '/admin/motors', expectText: /Armada Motor/i },
      { name: 'Pelacakan GPS', path: '/admin/gps', expectText: /Pelacakan GPS/i },
      { name: 'Kalender Armada', path: '/admin/calendar', expectText: /Kalender/i },
      { name: 'Jadwal Servis', path: '/admin/maintenance', expectText: /Servis|Perawatan|Maintenance/i },
      { name: 'Verifikasi Dokumen', path: '/admin/documents', expectText: /Verifikasi|Dokumen/i },
      { name: 'Pengguna', path: '/admin/users', expectText: /Pengguna|Pelanggan/i },
      { name: 'Ulasan', path: '/admin/reviews', expectText: /Ulasan|Review/i },
      { name: 'Promo', path: '/admin/promos', expectText: /Promo|Voucher/i },
      { name: 'Layanan Tambahan', path: '/admin/addons', expectText: /Tambahan|Add-on|Perlengkapan/i },
      { name: 'Aturan Harga', path: '/admin/pricing', expectText: /Harga|Tarif|Musiman/i },
      { name: 'Titik Antar-Jemput', path: '/admin/locations', expectText: /Lokasi|Titik|Antar/i },
      { name: 'Pesan Kontak', path: '/admin/messages', expectText: /Pesan|Kotak Masuk|Kontak/i },
      { name: 'Laporan', path: '/admin/reports', expectText: /Laporan|Pendapatan/i },
      { name: 'Audit Log', path: '/admin/audit', expectText: /Audit|Log/i },
      { name: 'Pengaturan', path: '/admin/settings', expectText: /Pengaturan|Konfigurasi/i },
    ];

    for (const ap of adminPages) {
      await page.goto(ap.path);
      await expect(page.getByText(ap.expectText).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Data motor tidak ditemukan/i)).toHaveCount(0);
    }

    expect(consoleErrors).toEqual([]);
  });
});
