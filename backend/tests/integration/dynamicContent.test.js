process.env.USE_DB = 'memory';

const request = require('supertest');
const app = require('../../src/app');
const {
  store,
  userRepo,
  motorRepo,
  auditRepo,
  contentRepo,
} = require('../../src/repositories');
const contentService = require('../../src/services/contentService');

describe('Integration Test: Dynamic Content, Versioning, Sanitization & Booking Terms Version', () => {
  let adminToken;
  let customerToken;
  let customerUser;
  let staffToken;

  const validRenter = {
    name: 'Budi Penyewa',
    phone: '081234567890',
    email: 'budi@example.com',
    idNumber: '3201234567890001',
  };

  beforeEach(async () => {
    store.resetToSeed();

    // 1. Login Admin
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = adminLogin.body.data.token;

    // 2. Login Customer
    const demoLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    customerToken = demoLogin.body.data.token;
    customerUser = demoLogin.body.data.user;

    // 3. Login Staff
    const user2 = await userRepo.findByEmail('budi@gmail.com');
    await userRepo.update(user2.id, { role: 'staff' });
    const staffLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'budi@gmail.com', password: 'Budi12345' });
    staffToken = staffLogin.body.data.token;
  });

  describe('1. Public Content Endpoints & Fallback', () => {
    test('GET /api/content/pages/:slug mengembalikan konten default saat basis data kosong', async () => {
      const res = await request(app).get('/api/content/pages/terms');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('terms');
      expect(res.body.data.title).toBe('Syarat dan Ketentuan');
      expect(res.body.data.bodyHtml).toContain('Harap baca ketentuan berikut');
      expect(res.body.data.version).toBe(0);
    });

    test('GET /api/content/pages/:slug mengembalikan 404 jika slug tidak valid', async () => {
      const res = await request(app).get('/api/content/pages/unknown-slug');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('GET /api/content/faqs mengembalikan array kosong saat belum ada FAQ', async () => {
      const res = await request(app).get('/api/content/faqs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    test('GET /api/content/blocks mengembalikan nilai default hero & announcement null', async () => {
      const res = await request(app).get('/api/content/blocks');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.heroTitle).toContain('Sewa motor');
      expect(res.body.data.heroSubtitle).toBeDefined();
      expect(res.body.data.ctaText).toBeDefined();
      expect(res.body.data.announcement).toBeNull();
    });
  });

  describe('2. Admin Content Pages, Versioning & XSS Neutralization', () => {
    test('Admin dapat melihat daftar halaman dan halaman otomatis di-materialize', async () => {
      const res = await request(app)
        .get('/api/admin/pages')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(4);
      const slugs = res.body.data.map((p) => p.slug);
      expect(slugs).toContain('terms');
      expect(slugs).toContain('privacy');
      expect(slugs).toContain('how-it-works');
      expect(slugs).toContain('about');
    });

    test('Admin mengedit halaman: riwayat versi bertambah, XSS dinetralkan di endpoint publik', async () => {
      const maliciousBody = [
        '# Ketentuan Baru Sewa Motor <script>alert("hack")</script>',
        '',
        'Penyewa wajib mematuhi aturan berikut:',
        '- Tidak boleh memindahtangankan motor <img src=x onerror=alert(1)>',
        '- Membawa SIM C asli [Klik](javascript:alert(2))',
      ].join('\n');

      const updateRes = await request(app)
        .put('/api/admin/pages/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Syarat & Ketentuan Sewa 2026',
          body: maliciousBody,
          note: 'Pembaruan syarat sewa musim liburan',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.version).toBe(2);

      // Cek endpoint publik langsung menampilkan perubahan
      const publicRes = await request(app).get('/api/content/pages/terms');
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.data.version).toBe(2);
      expect(publicRes.body.data.title).toBe('Syarat & Ketentuan Sewa 2026');
      expect(publicRes.body.data.bodyHtml).toContain('<h1>Ketentuan Baru Sewa Motor </h1>');
      // XSS harus dinetralkan
      expect(publicRes.body.data.bodyHtml).not.toContain('<script');
      expect(publicRes.body.data.bodyHtml).not.toContain('onerror');
      expect(publicRes.body.data.bodyHtml).not.toContain('javascript:');

      // Cek riwayat versi bertambah
      const versionsRes = await request(app)
        .get('/api/admin/pages/terms/versions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(versionsRes.status).toBe(200);
      expect(versionsRes.body.data.length).toBeGreaterThanOrEqual(2);
      expect(versionsRes.body.data[0].version).toBe(2);
      expect(versionsRes.body.data[0].changeNote).toBe('Pembaruan syarat sewa musim liburan');
    });

    test('Admin dapat memulihkan versi lama (restore) dan menghasilkan versi baru', async () => {
      // 1. Edit ke versi 2
      await request(app)
        .put('/api/admin/pages/privacy')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Kebijakan Privasi V2', body: 'Isi privasi versi 2' });

      // 2. Restore versi 1
      const restoreRes = await request(app)
        .post('/api/admin/pages/privacy/versions/1/restore')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.data.version).toBe(3);

      const pageRes = await request(app)
        .get('/api/admin/pages/privacy')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(pageRes.body.data.version).toBe(3);
    });

    test('Halaman yang disembunyikan (is_published = false) mengembalikan 404 di endpoint publik', async () => {
      const toggleRes = await request(app)
        .patch('/api/admin/pages/how-it-works/publish')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: false });

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.data.isPublished).toBe(false);

      const pubRes = await request(app).get('/api/content/pages/how-it-works');
      expect(pubRes.status).toBe(404);
      expect(pubRes.body.error.code).toBe('PAGE_UNAVAILABLE');

      // Admin tetap dapat melihatnya
      const adminRes = await request(app)
        .get('/api/admin/pages/how-it-works')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.isPublished).toBe(false);
    });

    test('Endpoint preview merender markdown dengan aman tanpa menyimpan', async () => {
      const res = await request(app)
        .post('/api/admin/pages/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: '## Pratinjau Cepat <script>alert(1)</script>' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.html).toContain('<h2>Pratinjau Cepat </h2>');
      expect(res.body.data.html).not.toContain('<script');
    });
  });

  describe('3. Admin FAQ Management & Public Filtering', () => {
    test('CRUD FAQ: tambah, update, urutkan (reorder), dan hapus', async () => {
      // 1. Create FAQ 1
      const f1 = await request(app)
        .post('/api/admin/faqs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Apakah helm disediakan?',
          answer: 'Ya, disediakan 2 helm berstandar SNI.',
        });
      expect(f1.status).toBe(201);
      const id1 = f1.body.data.id;

      // 2. Create FAQ 2
      const f2 = await request(app)
        .post('/api/admin/faqs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Bagaimana cara bayar?',
          answer: 'Bisa transfer bank atau QRIS.',
        });
      expect(f2.status).toBe(201);
      const id2 = f2.body.data.id;

      // 3. Cek publik
      let pub = await request(app).get('/api/content/faqs');
      expect(pub.status).toBe(200);
      expect(pub.body.data.length).toBe(2);
      expect(pub.body.data[0].question).toBe('Apakah helm disediakan?');

      // 4. Reorder
      const reorderRes = await request(app)
        .put('/api/admin/faqs/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [id2, id1] });
      expect(reorderRes.status).toBe(200);

      pub = await request(app).get('/api/content/faqs');
      expect(pub.body.data[0].id).toBe(id2);
      expect(pub.body.data[1].id).toBe(id1);

      // 5. Deactivate FAQ 2
      await request(app)
        .put(`/api/admin/faqs/${id2}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      pub = await request(app).get('/api/content/faqs');
      expect(pub.body.data.length).toBe(1);
      expect(pub.body.data[0].id).toBe(id1);

      // 6. Delete FAQ 1
      const delRes = await request(app)
        .delete(`/api/admin/faqs/${id1}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);

      pub = await request(app).get('/api/content/faqs');
      expect(pub.body.data.length).toBe(0);
    });
  });

  describe('4. Content Blocks & Announcement Display Window', () => {
    test('Update heroTitle & ctaText berhasil dan muncul di publik', async () => {
      const upd = await request(app)
        .put('/api/admin/content-blocks/heroTitle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Sewa Motor Terbaik di Jogja' });

      expect(upd.status).toBe(200);
      expect(upd.body.data.value).toBe('Sewa Motor Terbaik di Jogja');

      const pub = await request(app).get('/api/content/blocks');
      expect(pub.status).toBe(200);
      expect(pub.body.data.heroTitle).toBe('Sewa Motor Terbaik di Jogja');
    });

    test('Announcement hanya muncul jika aktif dan dalam rentang waktu startsAt - endsAt', async () => {
      // 1. Inactive announcement -> tidak muncul di publik
      await request(app)
        .put('/api/admin/content-blocks/announcement')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          value: {
            isActive: false,
            text: 'Diskon Akhir Pekan 20%',
            linkUrl: '/promos',
            linkLabel: 'Lihat Promo',
          },
        });

      let pub = await request(app).get('/api/content/blocks');
      expect(pub.body.data.announcement).toBeNull();

      // 2. Active announcement dengan rentang aktif saat ini -> muncul
      const now = new Date();
      const past = new Date(now.getTime() - 3600 * 1000).toISOString();
      const future = new Date(now.getTime() + 3600 * 1000).toISOString();

      await request(app)
        .put('/api/admin/content-blocks/announcement')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          value: {
            isActive: true,
            text: 'Diskon Kilat Sedang Berlangsung!',
            linkUrl: '/promos',
            linkLabel: 'Klaim Sekarang',
            startsAt: past,
            endsAt: future,
          },
        });

      pub = await request(app).get('/api/content/blocks');
      expect(pub.body.data.announcement).not.toBeNull();
      expect(pub.body.data.announcement.text).toBe('Diskon Kilat Sedang Berlangsung!');
      expect(pub.body.data.announcement.linkUrl).toBe('/promos');

      // 3. Active announcement tetapi sudah lewat (endsAt di masa lalu) -> tidak muncul
      const farPast1 = new Date(now.getTime() - 7200 * 1000).toISOString();
      const farPast2 = new Date(now.getTime() - 3600 * 1000).toISOString();

      await request(app)
        .put('/api/admin/content-blocks/announcement')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          value: {
            isActive: true,
            text: 'Promo Sudah Usai',
            startsAt: farPast1,
            endsAt: farPast2,
          },
        });

      pub = await request(app).get('/api/content/blocks');
      expect(pub.body.data.announcement).toBeNull();
    });
  });

  describe('5. Booking Terms Version Tracking', () => {
    test('Booking mencatat versi Syarat Sewa saat dibuat; perubahan syarat berikutnya tidak mengubah booking lama', async () => {
      // 1. Pastikan Terms sudah ada di versi 1
      await request(app)
        .get('/api/admin/pages')
        .set('Authorization', `Bearer ${adminToken}`);

      const motors = await motorRepo.findAll();
      const motor = motors.items ? motors.items[0] : motors[0];

      // 2. Buat booking dengan acceptedTermsVersion: 1
      const bookingPayload = {
        motorId: motor.id,
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        pickupTime: '10:00',
        renter: validRenter,
        payment: 'bank_transfer',
        acceptedTermsVersion: 1,
      };

      const bRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(bookingPayload);

      expect(bRes.status).toBe(201);
      expect(bRes.body.success).toBe(true);
      const bookingCode = bRes.body.data.code || bRes.body.data.bookingCode;
      expect(bRes.body.data.termsVersion).toBe(1);

      // 3. Admin memperbarui Syarat Sewa menjadi Versi 2
      await request(app)
        .put('/api/admin/pages/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Syarat Sewa Edisi 2027',
          body: 'Ketentuan diperbarui secara menyeluruh.',
          note: 'Update versi 2',
        });

      // 4. Booking lama diperiksa: termsVersion TETAP 1 (tidak berubah)
      const checkRes = await request(app)
        .get(`/api/bookings/${bookingCode}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.termsVersion).toBe(1);

      // 5. Booking baru dibuat: mencatat versi terbaru (Versi 2)
      const b2Res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          ...bookingPayload,
          startDate: '2026-11-15',
          endDate: '2026-11-17',
          acceptedTermsVersion: 2,
        });

      expect(b2Res.status).toBe(201);
      expect(b2Res.body.data.termsVersion).toBe(2);
    });
  });

  describe('6. Security & Audit Trail', () => {
    test('Non-admin (customer & staff) ditolak akses ke endpoint pengelolaan konten (401/403)', async () => {
      // Anonymous
      const anonRes = await request(app).get('/api/admin/pages');
      expect(anonRes.status).toBe(401);

      // Customer
      const custRes = await request(app)
        .get('/api/admin/pages')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(custRes.status).toBe(403);

      // Staff (hanya admin yang diizinkan untuk konten/halaman/FAQ)
      const staffRes = await request(app)
        .get('/api/admin/pages')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffRes.status).toBe(403);
    });

    test('Seluruh perubahan konten tercatat di audit_logs', async () => {
      // Lakukan perubahan pada content block
      await request(app)
        .put('/api/admin/content-blocks/ctaText')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Pesan Motor Sekarang' });

      // Cek audit logs
      const logsRes = await request(app)
        .get('/api/admin/audit-logs?action=UPDATE_CONTENT_BLOCK')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      const items = logsRes.body.data?.items || logsRes.body.data || [];
      const ctaLog = items.find((l) => l.action === 'UPDATE_CONTENT_BLOCK' && (l.targetId === 'ctaText' || l.entityId === 'ctaText'));
      expect(ctaLog).toBeDefined();
      expect(ctaLog.after).toBe('Pesan Motor Sekarang');
    });
  });
});
