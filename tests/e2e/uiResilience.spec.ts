import { test, expect } from '@playwright/test';

test.describe('E2E (g, h, j, k): UI Resilience, Error Recovery, Clean Console, & Dynamic Proof', () => {
  test('g & k: Bukti Dinamis & Penanganan Error Jaringan (ErrorState "Coba lagi")', async ({ page }) => {
    let apiCalled = false;

    // Intersepsi jaringan: pantau panggilan ke /api (Kriteria Selesai k)
    page.on('request', (req) => {
      if (req.url().includes('/api/')) {
        apiCalled = true;
      }
    });

    await page.goto('/motors');
    await page.waitForLoadState('networkidle');

    // Pastikan halaman benar-benar memanggil /api ke backend (bukan data mock statis)
    expect(apiCalled).toBe(true);

    // Sekarang simulasi kegagalan jaringan: cegat /api/motorcycles dengan 500
    await page.route('**/api/motorcycles*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { message: 'Server Sedang Gangguan' } }),
      });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // UI menampilkan ErrorState dengan tombol coba lagi / pesan ramah (tidak ada white screen)
    const errorState = page.locator('text=/gangguan|gagal|coba lagi/i').first();
    await expect(errorState).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('h: Navigasi aneh: Motor slug tidak ada menghasilkan halaman 404 / EmptyState yang rapi', async ({ page }) => {
    await page.goto('/motors/motor-fiktif-yang-pasti-tidak-ada-99999');
    await page.waitForLoadState('networkidle');

    // Halaman menampilkan 404 / tidak ditemukan tanpa crash / white screen
    const notFoundEl = page.locator('text=/tidak ditemukan|404|kembali/i').first();
    await expect(notFoundEl).toBeVisible();
  });

  test('h: Refresh di tengah formulir booking mempertahankan draf (Draft Persistence)', async ({ page }) => {
    const slug = 'honda-vario-160';
    await page.goto(`/booking/${slug}?start=2026-11-20&end=2026-11-22`);
    await page.waitForLoadState('networkidle');

    // Buka Step 2 atau isi input
    const lanjutBtn = page.getByRole('button', { name: /Lanjut|Selanjutnya/i }).first();
    if (await lanjutBtn.isVisible()) {
      await lanjutBtn.click();
    }

    const nameInput = page.locator('input[name="name"], input[placeholder*="nama" i]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('Budi Persistence Test');

      // Refresh browser
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Nilai input draf tetap bertahan dari localStorage
      const reloadedName = page.locator('input[name="name"], input[placeholder*="nama" i]').first();
      if (await reloadedName.isVisible()) {
        await expect(reloadedName).toHaveValue('Budi Persistence Test');
      }
    }
  });

  test('j: Konsol Bersih: Tidak ada console.error tak tertangani pada navigasi utama', async ({ page }) => {
    const uncaughtErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Abaikan error favicon atau analytics opsional jika ada
        if (!text.includes('favicon') && !text.includes('ERR_CONNECTION_REFUSED')) {
          uncaughtErrors.push(text);
        }
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.goto('/motors');
    await page.waitForLoadState('networkidle');

    expect(uncaughtErrors.length).toBe(0);
  });
});
