import { test, expect } from '@playwright/test';
import type { Client } from 'pg';
import { connectDb, reseed, setClock, verifyDocsViaApi, PNG_BUFFER, dayOffset, watchHealth } from './helpers';

test.describe('E2E (a & l): Pelanggan baru dari beranda sampai riwayat + verifikasi PostgreSQL', () => {
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

  test('Daftar -> unggah KTP/SIM -> verifikasi admin -> booking 3 langkah -> status -> riwayat', async ({ page, request }) => {
    const health = watchHealth(page);
    const email = `e2e_${Date.now()}@test.id`;
    const password = 'Rahasia123';
    const start = dayOffset(30);
    const end = dayOffset(32);

    // 1. Beranda memuat data dari API (bukan data statis)
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.getByRole('link', { name: /Cari Motor|Lihat Semua Motor|Motor/i }).first().click();
    await expect(page).toHaveURL(/\/motors/);

    // 2. Katalog dengan filter tanggal: hasil sesuai ketersediaan di database
    await page.goto(`/motors?start=${start}&end=${end}`);
    const cards = page.locator('article.card');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    const availableRes = await db.query(
      `SELECT slug, name FROM motorcycles WHERE status = 'active' ORDER BY id`,
    );
    expect(availableRes.rows.length).toBeGreaterThan(0);
    // Nama motor di kartu pertama harus ada di database
    const firstName = (await cards.first().locator('h3').innerText()).trim();
    expect(firstName.length).toBeGreaterThan(0);
    const dbMotor = await db.query(`SELECT slug, price_per_day, deposit FROM motorcycles WHERE name = $1`, [firstName]);
    expect(dbMotor.rows.length).toBe(1);
    const slug: string = dbMotor.rows[0].slug;
    const pricePerDay = Number(dbMotor.rows[0].price_per_day);
    const deposit = Number(dbMotor.rows[0].deposit);

    // 3. Detail motor: kartu pemesanan tampil
    await cards.first().locator('h3 a').click();
    await expect(page).toHaveURL(new RegExp(`/motors/${slug}`));
    await expect(page.locator('h1')).toContainText(firstName);
    await expect(page.locator('aside[aria-label="Pemesanan"]')).toBeVisible();

    // 4. Klik Sewa tanpa login -> diarahkan ke login/daftar
    await page.goto(`/booking/${slug}?start=${start}&end=${end}`);
    await expect(page).toHaveURL(/\/login/);

    // 5. Daftar akun baru lewat UI
    await page.goto('/register');
    await page.getByLabel('Nama lengkap').fill('Pelanggan E2E');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Nomor HP / WhatsApp').fill('081234567890');
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(2);
    await passwordInputs.nth(0).fill(password);
    await passwordInputs.nth(1).fill(password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Daftar' }).click();
    await expect(page).not.toHaveURL(/\/register/, { timeout: 15000 });

    const userRow = await db.query(`SELECT id, role, name, phone FROM users WHERE email = $1`, [email]);
    expect(userRow.rows.length).toBe(1);
    expect(userRow.rows[0].role).toBe('customer');
    expect(userRow.rows[0].name).toBe('Pelanggan E2E');
    const userId = userRow.rows[0].id;

    // 6. Unggah KTP & SIM lewat UI profil
    await page.goto('/profile');
    await page.getByRole('tab', { name: 'Dokumen' }).click();
    await page.locator('#file-ktp').setInputFiles({ name: 'ktp.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    await expect(page.getByText('Dokumen diunggah. Menunggu verifikasi.').first()).toBeVisible();
    await page.locator('#file-sim').setInputFiles({ name: 'sim.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    await expect
      .poll(async () => (await db.query(`SELECT count(*)::int c FROM user_documents WHERE user_id = $1`, [userId])).rows[0].c)
      .toBe(2);
    const docs = await db.query(`SELECT type, status FROM user_documents WHERE user_id = $1 ORDER BY type`, [userId]);
    expect(docs.rows).toEqual([
      { type: 'ktp', status: 'pending' },
      { type: 'sim', status: 'pending' },
    ]);

    // 7. Admin memverifikasi lewat API
    await verifyDocsViaApi(request, userId);
    const verified = await db.query(`SELECT type, status FROM user_documents WHERE user_id = $1 ORDER BY type`, [userId]);
    expect(verified.rows.every((r) => r.status === 'verified')).toBe(true);

    // 8. Booking 3 langkah
    await page.goto(`/booking/${slug}?start=${start}&end=${end}`);
    await expect(page.getByRole('heading', { name: 'Pemesanan' })).toBeVisible();
    await page.getByRole('button', { name: /Lanjut/ }).click(); // langkah 1 -> 2
    await page.getByLabel('Nama lengkap (sesuai KTP)').fill('Pelanggan E2E');
    await page.getByLabel('Nomor HP / WhatsApp').fill('081234567890');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('NIK (16 digit)').fill('3171234567890001');
    await page.getByRole('button', { name: /Lanjut/ }).click(); // langkah 2 -> 3
    await page.getByRole('radio', { name: /Transfer bank/ }).check();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Bayar Sekarang' }).click();

    // 9. Halaman status booking
    await expect(page).toHaveURL(/\/bookings\/RM-|\/bookings\/[A-Z0-9-]+/, { timeout: 20000 });
    const code = new URL(page.url()).pathname.split('/').pop()!;

    // 10. Verifikasi langsung ke PostgreSQL (l)
    const b = await db.query(
      `SELECT b.booking_code, b.status, b.total_days, b.price_per_day, b.rental_total, b.deposit, b.grand_total,
              b.start_date::text AS start_date, b.end_date::text AS end_date, m.slug
         FROM bookings b JOIN motorcycles m ON m.id = b.motorcycle_id
        WHERE b.booking_code = $1 AND b.user_id = $2`,
      [code, userId],
    );
    expect(b.rows.length).toBe(1);
    const row = b.rows[0];
    expect(row.slug).toBe(slug);
    expect(row.start_date).toBe(start);
    expect(row.end_date).toBe(end);
    expect(row.total_days).toBe(2);
    expect(Number(row.price_per_day)).toBe(pricePerDay);
    expect(Number(row.deposit)).toBe(deposit);
    expect(Number(row.rental_total)).toBe(pricePerDay * 2);
    expect(Number(row.grand_total)).toBe(pricePerDay * 2 + deposit);
    expect(['pending', 'confirmed']).toContain(row.status);

    // 11. Riwayat memuat booking tersebut
    await page.goto('/bookings');
    await expect(page.getByText(code).first()).toBeVisible();

    // 12. Konsol bersih & tidak ada request gagal tak terduga; semua data berasal dari /api (k)
    expect(health.consoleProblems, health.consoleProblems.join('\n')).toEqual([]);
    expect(health.failedRequests, health.failedRequests.join('\n')).toEqual([]);
    expect(health.apiCalls.some((c) => c.includes('/motorcycles') || c.includes('/motors'))).toBe(true);
    expect(health.apiCalls.some((c) => c.startsWith('POST /bookings'))).toBe(true);
  });
});
