import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES_FOR_A11Y = [
  { name: 'Beranda', path: '/' },
  { name: 'Katalog Motor', path: '/motors' },
  { name: 'Login', path: '/login' },
  { name: 'Detail Motor', path: '/motors/honda-vario-160' },
  { name: 'Formulir Booking', path: '/booking/honda-vario-160?start=2026-11-20&end=2026-11-22' },
];

test.describe('A11y Test: Axe-Core Automated Accessibility Scan (Nol Pelanggaran Kritis/Serius)', () => {
  for (const pageItem of PAGES_FOR_A11Y) {
    test(`Halaman ${pageItem.name} (${pageItem.path}): Nol pelanggaran aksesibilitas kritis/serius`, async ({ page }) => {
      await page.goto(pageItem.path);
      await page.waitForLoadState('networkidle');

      // Jalankan audit axe-core
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Filter hanya pelanggaran serius dan kritis
      const severeViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      if (severeViolations.length > 0) {
        console.error(`Ditemukan pelanggaran a11y pada halaman ${pageItem.name}:`, JSON.stringify(severeViolations, null, 2));
      }

      // Kriteria WAJIB: Nol pelanggaran serius / kritis
      expect(severeViolations.length).toBe(0);
    });
  }
});
