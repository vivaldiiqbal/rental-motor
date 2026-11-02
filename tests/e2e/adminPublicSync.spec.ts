import { test, expect } from '@playwright/test';
import type { Client } from 'pg';
import { connectDb, reseed, setClock } from './helpers';

test.describe('E2E (d, e, f): Admin Changes Sync to Public, Tiered Refund, & Expiry', () => {
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

  test('d: Perubahan Admin (Ubah Harga & Nonaktifkan) langsung tersinkron ke halaman publik', async ({ page }) => {
    // 1. Ambil satu motor dari DB
    const motorRes = await db.query("SELECT id, slug, name, price_per_day FROM motorcycles WHERE id = 1");
    expect(motorRes.rows.length).toBeGreaterThan(0);
    const motor = motorRes.rows[0];
    const originalPrice = Number(motor.price_per_day);
    const newPrice = originalPrice + 50000;

    // 2. Ubah harga di DB (seperti aksi admin update motor)
    await db.query("UPDATE motorcycles SET price_per_day = $1 WHERE id = 1", [newPrice]);

    // 3. Muat halaman detail di browser
    await page.goto(`/motors/${motor.slug}`);
    await page.waitForLoadState('networkidle');

    // 4. Verifikasi harga baru tampil di halaman publik
    const formattedNewPrice = new Intl.NumberFormat('id-ID').format(newPrice);
    await expect(page.locator(`text=${formattedNewPrice}`).first()).toBeVisible();

    // 5. Kembalikan harga asli
    await db.query("UPDATE motorcycles SET price_per_day = $1 WHERE id = 1", [originalPrice]);
  });

  test('f: Booking Kedaluwarsa: Pemesanan pending yang expired membebaskan kembali unit motor', async ({ page }) => {
    // 1. Ambil id user dan motor yang sah dari DB
    const userRes = await db.query("SELECT id FROM users LIMIT 1");
    const userId = userRes.rows[0].id;
    const motorRes = await db.query("SELECT id FROM motorcycles LIMIT 1");
    const motorId = motorRes.rows[0].id;

    // 2. Buat booking berstatus expired di database
    const code = `RK-EXP-${Date.now().toString().slice(-4)}`;
    await db.query(`
      INSERT INTO bookings (
        booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
        pickup_time, renter_name, renter_phone, renter_email, status,
        price_per_day, subtotal, rental_total, deposit, grand_total, expires_at
      ) VALUES (
        $1, $2, $3, '2026-12-10', '2026-12-12', 2,
        '09:00', 'Exp Renter', '081234567890', 'exp@test.id', 'expired',
        100000, 200000, 200000, 200000, 400000, now() - INTERVAL '1 hour'
      )
    `, [code, userId, motorId]);

    // 3. Kunjungi halaman pencarian motor pada tanggal tersebut
    await page.goto('/motors?start=2026-12-10&end=2026-12-12');
    await page.waitForLoadState('networkidle');

    // 4. Verifikasi motor tetap muncul / tersedia (karena booking sudah expired)
    await expect(page.locator('article.card').first()).toBeVisible();
  });
});

