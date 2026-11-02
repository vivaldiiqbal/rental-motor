import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';

export const API = 'http://localhost:5001/api';
export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://rodakita_user:rahasia123@localhost:5433/rodakita_test';

// PNG 1x1 valid (magic bytes asli) untuk unggah KTP/SIM.
export const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Koneksi langsung ke database TEST (menolak database yang tidak berakhiran _test). */
export async function connectDb(): Promise<Client> {
  const dbName = new URL(TEST_DB_URL).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Database E2E harus berakhiran _test, bukan "${dbName}"`);
  }
  const db = new Client({ connectionString: TEST_DB_URL });
  await db.connect();
  return db;
}

/** Kembalikan database ke seed dasar + reset jam terkendali (hanya ada saat NODE_ENV=test). */
export async function reseed(request: APIRequestContext) {
  const res = await request.post(`${API}/__test/reseed`);
  expect(res.ok(), `reseed gagal: ${res.status()} ${await res.text()}`).toBeTruthy();
}

export async function setClock(request: APIRequestContext, iso: string | null) {
  const res = await request.post(`${API}/__test/clock`, { data: { iso } });
  expect(res.ok(), `setClock gagal: ${res.status()} ${await res.text()}`).toBeTruthy();
}

export async function runExpireJob(request: APIRequestContext) {
  const res = await request.post(`${API}/__test/expire-run`);
  expect(res.ok(), `expire-run gagal: ${res.status()}`).toBeTruthy();
}

export async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${email} gagal: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const token: string = body.data.token;
  const user = body.data.user;
  return { token, user, headers: { Authorization: `Bearer ${token}` } };
}

export async function adminAuth(request: APIRequestContext) {
  return apiLogin(request, 'admin@rodakita.id', 'Admin12345');
}

export async function verifyDocsViaApi(request: APIRequestContext, userId: number | string) {
  const admin = await adminAuth(request);
  for (const type of ['ktp', 'sim']) {
    const res = await request.post(`${API}/admin/documents/${userId}/${type}/verify`, {
      headers: admin.headers,
      data: { action: 'approve' },
    });
    expect(res.ok(), `verify ${type} gagal: ${res.status()} ${await res.text()}`).toBeTruthy();
  }
}

/** Format tanggal YYYY-MM-DD relatif terhadap hari ini (WIB). */
export function dayOffset(days: number, from = new Date()): string {
  const d = new Date(from.getTime() + 7 * 3600 * 1000 + days * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Kumpulkan console.error/warning dan request /api yang gagal tak terduga. */
export function watchHealth(page: Page, allowedStatuses: number[] = []) {
  const consoleProblems: string[] = [];
  const failedRequests: string[] = [];
  const apiCalls: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleProblems.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    const url = r.url();
    if (url.includes('/api/')) {
      apiCalls.push(`${r.request().method()} ${url.replace(API, '')} -> ${r.status()}`);
      if (r.status() >= 400 && !allowedStatuses.includes(r.status())) {
        failedRequests.push(`${r.request().method()} ${url} -> ${r.status()}`);
      }
    }
  });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} (${r.failure()?.errorText})`));
  return { consoleProblems, failedRequests, apiCalls };
}

export interface TestCustomer {
  id: number;
  email: string;
  password: string;
  token: string;
  name: string;
}

/** Daftar pelanggan lewat API, unggah KTP/SIM asli (PNG), lalu admin menyetujui lewat API. */
export async function createVerifiedCustomer(request: APIRequestContext, label: string): Promise<TestCustomer> {
  const email = `${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.id`;
  const password = 'Rahasia123';
  const name = `Pelanggan ${label}`;
  const reg = await request.post(`${API}/auth/register`, {
    data: { name, email, phone: '081234567890', password },
  });
  expect(reg.status(), `register gagal: ${await reg.text()}`).toBe(201);
  const body = await reg.json();
  const token: string = body.data.token;
  const id = Number(body.data.user.id);
  for (const type of ['ktp', 'sim']) {
    const up = await request.post(`${API}/auth/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { [type]: { name: `${type}.png`, mimeType: 'image/png', buffer: PNG_BUFFER } },
    });
    expect(up.ok(), `upload ${type} gagal: ${up.status()} ${await up.text()}`).toBeTruthy();
  }
  await verifyDocsViaApi(request, id);
  return { id, email, password, token, name };
}

/** Pasang sesi login ke konteks browser (sama seperti yang ditulis aplikasi saat login). */
export async function loginContext(context: BrowserContext, c: TestCustomer) {
  await context.addInitScript(
    ([token, id]) => {
      localStorage.setItem('rk_token_v1', token as string);
      localStorage.setItem('rk_session_v1', JSON.stringify(String(id)));
    },
    [c.token, c.id],
  );
}

/** Isi 3 langkah booking sampai tepat sebelum tombol "Bayar Sekarang". */
export async function fillBookingUntilPay(page: Page, c: TestCustomer, slug: string, start: string, end: string) {
  await page.goto(`/booking/${slug}?start=${start}&end=${end}`);
  await expect(page.getByRole('heading', { name: 'Pemesanan' })).toBeVisible();
  await page.getByRole('button', { name: /Lanjut/ }).click();
  await page.getByLabel('Nama lengkap (sesuai KTP)').fill(c.name);
  await page.getByLabel('Nomor HP / WhatsApp').fill('081234567890');
  await page.getByLabel('Email').fill(c.email);
  await page.getByLabel('NIK (16 digit)').fill('3171234567890001');
  await page.getByRole('button', { name: /Lanjut/ }).click();
  await page.getByRole('radio', { name: /Transfer bank/ }).check();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Bayar Sekarang' })).toBeVisible();
}

