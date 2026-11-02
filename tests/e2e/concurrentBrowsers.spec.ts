import { test, expect } from '@playwright/test';
import type { Client } from 'pg';
import { connectDb, reseed, setClock, createVerifiedCustomer, loginContext, fillBookingUntilPay, dayOffset } from './helpers';

test.describe('E2E (c): Dua browser memesan motor & tanggal sama bersamaan', () => {
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

  test('Tepat satu berhasil; yang lain melihat pesan bentrok + saran tanggal; DB hanya 1 baris', async ({ browser, request }) => {
    const slug = 'honda-vario-160';
    const start = dayOffset(60);
    const end = dayOffset(63);

    const [alice, bob] = await Promise.all([
      createVerifiedCustomer(request, 'alice'),
      createVerifiedCustomer(request, 'bob'),
    ]);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await loginContext(ctxA, alice);
    await loginContext(ctxB, bob);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Keduanya sampai tepat sebelum "Bayar Sekarang" pada motor & tanggal yang sama
    await Promise.all([
      fillBookingUntilPay(pageA, alice, slug, start, end),
      fillBookingUntilPay(pageB, bob, slug, start, end),
    ]);

    // Klik bersamaan
    await Promise.all([
      pageA.getByRole('button', { name: 'Bayar Sekarang' }).click(),
      pageB.getByRole('button', { name: 'Bayar Sekarang' }).click(),
    ]);

    // Tunggu hasil: satu pindah ke halaman status, satu menampilkan pesan bentrok
    const outcome = async (page: typeof pageA) => {
      const success = page.waitForURL(/\/bookings\/[A-Za-z0-9-]+$/, { timeout: 20000 }).then(() => 'success' as const);
      const conflict = page
        .getByText('Maaf, motor sudah tidak tersedia pada rentang tanggal yang dipilih.')
        .waitFor({ timeout: 20000 })
        .then(() => 'conflict' as const);
      return Promise.race([success, conflict]);
    };
    const results = await Promise.all([outcome(pageA), outcome(pageB)]);
    expect(results.filter((r) => r === 'success')).toHaveLength(1);
    expect(results.filter((r) => r === 'conflict')).toHaveLength(1);

    const loserPage = results[0] === 'conflict' ? pageA : pageB;
    const winnerPage = results[0] === 'success' ? pageA : pageB;
    const winner = results[0] === 'success' ? alice : bob;

    // Yang kalah: pesan bentrok terlihat + saran tanggal terdekat dari server
    await expect(loserPage.getByRole('alert')).toContainText('tidak tersedia');
    const suggestion = loserPage.getByTestId('date-suggestion');
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText('Tanggal terdekat yang tersedia');
    // Saran tidak boleh beririsan dengan booking pemenang
    const suggestedStart = (await suggestion.locator('strong').first().innerText()).trim();
    expect(suggestedStart >= end).toBe(true); // rentang pemenang [start, end) -> saran mulai di/setelah end

    // Pemenang berada di halaman status booking miliknya
    const code = new URL(winnerPage.url()).pathname.split('/').pop()!;

    // PostgreSQL: tepat 1 booking aktif pada motor+tanggal itu, milik pemenang
    const rows = await db.query(
      `SELECT b.booking_code, b.user_id, b.status
         FROM bookings b JOIN motorcycles m ON m.id = b.motorcycle_id
        WHERE m.slug = $1 AND b.start_date = $2 AND b.end_date = $3 AND b.status NOT IN ('cancelled','expired')`,
      [slug, start, end],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].booking_code).toBe(code);
    expect(Number(rows.rows[0].user_id)).toBe(winner.id);

    // Yang kalah memakai saran tanggal -> berhasil memesan
    await loserPage.getByRole('button', { name: 'Pakai tanggal ini' }).click();
    await expect(loserPage.getByText('Tanggal terdekat yang tersedia')).toHaveCount(0);

    await ctxA.close();
    await ctxB.close();
  });
});
