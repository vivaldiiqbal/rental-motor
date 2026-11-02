import { test, expect } from '@playwright/test';

test.describe('E2E Regression: Admin Booking Manual Payment Confirmation', () => {
  test('Konfirmasi Pembayaran Manual: dialog Bahasa Indonesia ("Dikonfirmasi"), tanpa toast "Booking tidak ditemukan", dan status berhasil diperbarui', async ({ page }) => {
    // 1. Kunjungi Login Admin
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 2. Isi kredensial Admin
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passInput = page.locator('input[type="password"], input[name="password"]').first();

    await emailInput.fill('admin@rodakita.id');
    await passInput.fill('Admin12345');

    const submitBtn = page.getByRole('button', { name: /Masuk|Login/i }).first();
    await submitBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 3. Masuk ke Halaman Admin Bookings
    await page.goto('/admin/bookings');
    await page.waitForLoadState('networkidle');

    // 4. Cari tombol "Konfirmasi Pembayaran Manual" pada baris booking yang pending
    const confirmBtn = page.locator('button[title="Konfirmasi Pembayaran Manual"]').first();
    await expect(confirmBtn).toBeVisible({ timeout: 15000 });
    await confirmBtn.click();

    // 5. Verifikasi Modal Konfirmasi muncul dan teks status dalam Bahasa Indonesia ("Dikonfirmasi", bukan raw 'confirmed')
    const dialogTitle = page.getByRole('heading', { name: /Konfirmasi Pembayaran Manual/i });
    await expect(dialogTitle).toBeVisible();

    const dialogContent = page.locator('text=Status akan diubah menjadi "Dikonfirmasi".');
    await expect(dialogContent).toBeVisible();

    // 6. Tombol konfirmasi di modal
    const dialogConfirmBtn = page.getByRole('button', { name: 'Konfirmasi Bayar' });
    await expect(dialogConfirmBtn).toBeVisible();
    await dialogConfirmBtn.click();

    // 7. Verifikasi toast: TIDAK ada error "Booking tidak ditemukan."
    const errorToast = page.locator('text="Booking tidak ditemukan."');
    await expect(errorToast).toHaveCount(0);

    // Verifikasi toast sukses muncul
    const successToast = page.locator('text=/berhasil/i').first();
    await expect(successToast).toBeVisible({ timeout: 10000 });
  });
});
