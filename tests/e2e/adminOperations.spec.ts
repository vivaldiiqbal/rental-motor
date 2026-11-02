import { test, expect } from '@playwright/test';
import type { Client } from 'pg';
import { connectDb, reseed, setClock } from './helpers';

test.describe('E2E (b & l): Admin Operations Lifecycle & PostgreSQL Row Verification', () => {
  let db: Client;

  test.beforeAll(async () => {
    db = await connectDb();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test.beforeEach(async ({ request }) => {
    await reseed(request);
    await setClock(request, null);
  });

  test('Operasional Admin: Login -> Dashboard -> Dokumen -> Bookings -> Laporan -> Verifikasi DB', async ({ page }) => {
    // 1. Kunjungi Login Admin
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 2. Isi kredensial Admin
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passInput = page.locator('input[type="password"], input[name="password"]').first();

    await emailInput.fill('admin@rodakita.id');
    await passInput.fill('Admin12345');

    const submitBtn = page.getByRole('button', { name: /Masuk|Login/i }).first();
    await submitBtn.click();

    // Tunggu navigasi setelah login berhasil
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 3. Masuk ke Panel Admin
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15000 });

    // 4. Buka Halaman Dokumen
    await page.goto('/admin/documents');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').filter({ hasText: /Dokumen/i })).toBeVisible();

    // 5. Buka Halaman Daftar Booking
    await page.goto('/admin/bookings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').filter({ hasText: /Booking|Pemesanan/i })).toBeVisible();

    // 6. Buka Halaman Laporan Keuangan
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').filter({ hasText: /Laporan/i })).toBeVisible();

    // 7. Verifikasi langsung ke database PostgreSQL (Kriteria Selesai l)
    const adminUser = await db.query("SELECT id, email, role, is_active FROM users WHERE email = 'admin@rodakita.id'");
    expect(adminUser.rows.length).toBe(1);
    expect(adminUser.rows[0].role).toBe('admin');
    expect(adminUser.rows[0].is_active).toBe(true);

    const bookingsCount = await db.query("SELECT COUNT(*)::int AS count FROM bookings");
    expect(Number(bookingsCount.rows[0].count)).toBeGreaterThan(0);
  });
});

