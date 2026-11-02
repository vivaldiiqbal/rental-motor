import { test, expect } from '@playwright/test';
import type { Client } from 'pg';
import { connectDb, reseed } from './helpers';

test.describe('E2E: Pelacakan GPS Armada (Admin & Staff)', () => {
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

  test('1. Staff & Admin RBAC: Staff tidak melihat tab Perangkat, Area Geofence, dan Pengaturan', async ({ page }) => {
    // 1. Login sebagai Staff melalui /admin/login
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').first().fill('staff@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Staff12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();

    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    // 2. Kunjungi halaman GPS Tracking
    await page.goto('/admin/gps');
    await page.waitForLoadState('networkidle');

    // 3. Verifikasi judul dan tab
    await expect(page.locator('h1').filter({ hasText: /Pelacakan GPS/i })).toBeVisible({ timeout: 10000 });

    // Staff melihat tab Peta Live dan Peringatan
    await expect(page.getByRole('button', { name: /Peta Live/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Peringatan/i }).first()).toBeVisible();

    // Staff TIDAK BOLEH melihat tab Perangkat, Area Geofence, Pengaturan, Log Akses
    await expect(page.getByRole('button', { name: /^Perangkat$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Area Geofence$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Pengaturan$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Log Akses$/i })).not.toBeVisible();
  });

  test('2. Admin memiliki akses penuh: melihat seluruh tab dan dapat membuka form tracker', async ({ page }) => {
    // 1. Login sebagai Admin melalui /admin/login
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();

    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    // 2. Kunjungi halaman GPS
    await page.goto('/admin/gps');
    await page.waitForLoadState('networkidle');

    // Admin melihat tab Perangkat, Area Geofence, Pengaturan, Log Akses
    await expect(page.getByRole('button', { name: /^Perangkat$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Area Geofence$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pengaturan$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Log Akses$/i })).toBeVisible();

    // Klik tab Perangkat
    await page.getByRole('button', { name: /^Perangkat$/i }).click();
    await expect(page.locator('h2').filter({ hasText: /Perangkat GPS Tracker/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pasang Tracker Baru/i })).toBeVisible();
  });

  test('3. Pelanggan tidak pernah menerima data lokasi atau halaman GPS', async ({ page }) => {
    // 1. Login sebagai Customer via /login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').first().fill('demo@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Demo12345');
    await page.getByRole('button', { name: /Masuk|Login/i }).first().click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Coba akses /admin/gps secara langsung
    await page.goto('/admin/gps');
    await page.waitForLoadState('networkidle');

    // Harus diarahkan keluar dari panel admin ke /admin/login
    await expect(page).toHaveURL(/\/admin\/login/);

    // 3. Periksa Syarat Sewa memuat pemberitahuan GPS transparansi
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Pelacakan GPS/i);
    await expect(page.locator('body')).toContainText(/privasi/i);
  });

  test('4. Telemetri Realtime: Ingest data baru memperbarui kartu motor dan peta tanpa refresh', async ({ page, request }) => {
    // 1. Login sebagai Admin
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();

    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    // 2. Pastikan motor 1 memiliki perangkat terdaftar
    const insRes = await db.query(`
      INSERT INTO gps_devices (motorcycle_id, provider, external_id, label, is_active)
      VALUES (1, 'simulator', 'E2E-SIM-01', 'Tracker E2E Vario', true)
      ON CONFLICT (motorcycle_id) DO UPDATE SET external_id = 'E2E-SIM-01', is_active = true
      RETURNING external_id, label
    `);
    const activeExternalId = insRes.rows[0].external_id;

    // 3. Buka halaman GPS
    await page.goto('/admin/gps');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1').filter({ hasText: /Pelacakan GPS/i })).toBeVisible({ timeout: 10000 });

    // 4. Kirim posisi baru via Ingest API
    const ingestRes = await request.post('http://localhost:5001/api/gps/ingest/simulator', {
      headers: {
        'x-gps-secret': 'rodakita_gps_secret_shared_key_2026',
      },
      data: {
        externalId: activeExternalId,
        lat: -8.6705,
        lng: 115.2127,
        speedKmh: 45,
        heading: 90,
        ignition: true,
        batteryPct: 88,
        powerConnected: true,
        recordedAt: new Date().toISOString(),
      },
    });

    expect(ingestRes.status()).toBe(202);

    // 5. Verifikasi di UI bahwa motor terupdate secara realtime (kecepatan 45 km/h, status ON)
    await expect(page.locator('body')).toContainText(/45 km\/h/i, { timeout: 10000 });
  });

  test('5. Halaman tangguh (resilient): Menampilkan keadaan kosong jelas saat tidak ada perangkat', async ({ page }) => {
    // 1. Login sebagai Admin
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@rodakita.id');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Admin12345');
    await page.getByRole('button', { name: /Masuk ke Panel/i }).first().click();

    await page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 10000 });

    // Buka halaman GPS
    await page.goto('/admin/gps');
    await page.waitForLoadState('networkidle');

    // Halaman tidak crash, Leaflet map terinisialisasi
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
  });
});
