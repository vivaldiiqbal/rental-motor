import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../a11y-visual/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'mobile_360', width: 360, height: 640 },
  { name: 'tablet_768', width: 768, height: 1024 },
  { name: 'desktop_1280', width: 1280, height: 800 },
];

const PAGES_TO_TEST = [
  { name: 'beranda', path: '/' },
  { name: 'katalog_motor', path: '/motors' },
  { name: 'login', path: '/login' },
];

test.describe('E2E (i): Desain Responsif & Bebas Scroll Horizontal pada Viewport 360, 768, 1280', () => {
  for (const vp of VIEWPORTS) {
    for (const p of PAGES_TO_TEST) {
      test(`Viewport ${vp.name} (${vp.width}x${vp.height}) pada halaman ${p.name}: Tidak ada scroll horizontal & elemen utama terlihat`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(p.path);
        await page.waitForLoadState('networkidle');

        // 1. Verifikasi tidak ada horizontal overflow / horizontal scrollbar
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);

        // 2. Verifikasi konten utama terlihat
        await expect(page.locator('main, section, h1').first()).toBeVisible();

        // 3. Simpan tangkapan layar (Kriteria Selesai i)
        const screenshotPath = path.join(SCREENSHOT_DIR, `${p.name}_${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        expect(fs.existsSync(screenshotPath)).toBe(true);
      });
    }
  }
});
