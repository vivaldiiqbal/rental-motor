const request = require('supertest');
const { format, addDays } = require('date-fns');
const app = require('../../src/app');
const { pool } = require('../../db/pool');
const { bookingRepo, motorRepo, userRepo, paymentRepo, promoRepo, store } = require('../../src/repositories');
const { bookingCapabilities } = require('../../src/utils/bookingCapabilities');

describe('Integration Test: Cancellation Engine, Capabilities & Concurrency (Tahap 1)', () => {
  let customerToken = '';
  let customerUser = null;
  let adminToken = '';
  let staffToken = '';
  const now = new Date();

  beforeAll(async () => {
    store.resetToSeed();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    // Login akun customer (Ilham Ramadhan)
    const custRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    customerToken = custRes.body.data.token;
    customerUser = custRes.body.data.user;

    // Login akun admin (Hendro Siswanto)
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = adminRes.body.data.token;

    // Login akun staf (Joko Santoso)
    const staffRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff@rodakita.id', password: 'Staff12345' });
    staffToken = staffRes.body.data.token;
  });

  describe('1. Unit & Logic Verification: bookingCapabilities Function', () => {
    test('Pelanggan online: pending belum bayar dapat membatalkan; sudah bayar ditolak', () => {
      // Pending belum bayar
      const bOnlinePending = { id: 101, status: 'pending', paymentMethod: 'bank_transfer', version: 1 };
      const pPending = { status: 'pending', proofUploadedAt: null };
      const cap1 = bookingCapabilities(bOnlinePending, pPending, { role: 'customer' });
      expect(cap1.canCancel).toBe(true);
      expect(cap1.cancelBlockedReason).toBeNull();

      // Sudah bayar (paid)
      const pPaid = { status: 'paid' };
      const cap2 = bookingCapabilities(bOnlinePending, pPaid, { role: 'customer' });
      expect(cap2.canCancel).toBe(false);
      expect(cap2.cancelBlockedReason).toMatch(/sudah dibayar/i);

      // Status confirmed
      const bConfirmed = { id: 102, status: 'confirmed', paymentMethod: 'bank_transfer', version: 1 };
      const cap3 = bookingCapabilities(bConfirmed, pPaid, { role: 'customer' });
      expect(cap3.canCancel).toBe(false);
      expect(cap3.cancelBlockedReason).toMatch(/sudah dibayar/i);
    });

    test('Pelanggan online: bukti bayar sedang diverifikasi ditolak dengan alasan spesifik', () => {
      const bPending = { id: 103, status: 'pending', paymentMethod: 'bank_transfer', version: 1 };
      const pProofUploaded = { status: 'pending', proofUploadedAt: '2026-10-24T10:00:00Z', proofVerifiedAt: null };
      const cap = bookingCapabilities(bPending, pProofUploaded, { role: 'customer' });
      expect(cap.canCancel).toBe(false);
      expect(cap.cancelBlockedReason).toBe('Bukti pembayaran sedang diverifikasi. Hubungi admin bila ingin membatalkan.');
    });

    test('Pelanggan tunai: boleh membatalkan sampai serah terima (selama pending)', () => {
      const bCashPending = { id: 104, status: 'pending', paymentMethod: 'cash', version: 1 };
      const cap1 = bookingCapabilities(bCashPending, null, { role: 'customer' });
      expect(cap1.canCancel).toBe(true);
      expect(cap1.cancelBlockedReason).toBeNull();

      // Sudah serah terima (active) -> ditolak
      const bCashActive = { id: 104, status: 'active', paymentMethod: 'cash', version: 2 };
      const cap2 = bookingCapabilities(bCashActive, null, { role: 'customer' });
      expect(cap2.canCancel).toBe(false);
      expect(cap2.cancelBlockedReason).toMatch(/sedang berjalan/i);
    });

    test('Matriks Admin vs Staf: Staf dilarang membatalkan booking berbayar', () => {
      const bPaid = { id: 105, status: 'confirmed', paymentMethod: 'bank_transfer', paidAt: '2026-10-24T10:00:00Z', version: 1 };
      const pPaid = { status: 'paid' };

      // Admin berhak
      const capAdmin = bookingCapabilities(bPaid, pPaid, { role: 'admin' });
      expect(capAdmin.canCancel).toBe(true);

      // Staf dilarang
      const capStaff = bookingCapabilities(bPaid, pPaid, { role: 'staff' });
      expect(capStaff.canCancel).toBe(false);
      expect(capStaff.cancelBlockedReason).toBe('Hanya admin yang berhak membatalkan pemesanan berbayar.');
    });
  });

  describe('2. Pembatalan Pelanggan via API (POST /api/bookings/:id/cancel)', () => {
    test('Pelanggan berhasil membatalkan booking pending online; payment pending menjadi cancelled', async () => {
      const start = format(addDays(now, 20), 'yyyy-MM-dd');
      const end = format(addDays(now, 22), 'yyyy-MM-dd');

      // 1. Buat booking online pending
      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          payment: 'bank_transfer',
        });
      if (createRes.status !== 201) console.log('CREATE_BOOKING_ERROR:', JSON.stringify(createRes.body));
      expect(createRes.status).toBe(201);
      const bookingId = createRes.body.data.id;
      expect(createRes.body.data.version).toBe(1);

      // 2. Buat payment pending terkait
      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId,
          method: 'bank_transfer',
        });

      // 3. Batalkan booking
      const cancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          reason: 'Ada urusan mendadak',
          version: 1,
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.version).toBe(2);
      expect(cancelRes.body.data.cancelledBy).toBe('customer');

      // 4. Periksa bahwa payment pending otomatis berubah menjadi cancelled
      const pay = await paymentRepo.findByBookingId(bookingId);
      expect(pay.status).toBe('cancelled');
    });

    test('Pelanggan ditolak membatalkan booking online yang sudah lunas/confirmed (400 CANCELLATION_BLOCKED)', async () => {
      const start = format(addDays(now, 25), 'yyyy-MM-dd');
      const end = format(addDays(now, 27), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          payment: 'bank_transfer',
        });
      const bookingId = createRes.body.data.id;

      // Lakukan simulasi pembayaran agar lunas (confirmed)
      const payRes = await request(app)
        .post(`/api/payments/${bookingId}/simulate-pay`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(payRes.status).toBe(200);

      // Pelanggan mencoba membatalkan booking yang sudah lunas
      const cancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Ingin batal' });

      expect(cancelRes.status).toBe(400);
      expect(cancelRes.body.error.code).toBe('CANCELLATION_BLOCKED');
      expect(cancelRes.body.error.message).toMatch(/sudah dibayar/i);
    });
  });

  describe('3. Pembatalan Admin & Pembatasan Staf (POST /api/admin/bookings/:id/cancel)', () => {
    test('Staf dilarang membatalkan booking yang sudah berbayar (403 FORBIDDEN_ROLE)', async () => {
      const start = format(addDays(now, 30), 'yyyy-MM-dd');
      const end = format(addDays(now, 32), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          payment: 'bank_transfer',
        });
      const bookingId = createRes.body.data.id;

      await request(app)
        .post(`/api/payments/${bookingId}/simulate-pay`)
        .set('Authorization', `Bearer ${customerToken}`);

      // Staf mencoba cancel
      const staffCancelRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Dibatalkan staf' });

      expect(staffCancelRes.status).toBe(403);
      expect(staffCancelRes.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    test('Admin berhasil membatalkan booking berbayar dengan nominal refund dan payment status menjadi refunded', async () => {
      const start = format(addDays(now, 35), 'yyyy-MM-dd');
      const end = format(addDays(now, 37), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          payment: 'bank_transfer',
        });
      const bookingId = createRes.body.data.id;
      const totalPaid = createRes.body.data.total;

      await request(app)
        .post(`/api/payments/${bookingId}/simulate-pay`)
        .set('Authorization', `Bearer ${customerToken}`);

      // Admin membatalkan dengan refund penuh
      const adminCancelRes = await request(app)
        .post(`/api/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Kendaraan mengalami kendala teknis mendadak sebelum serah terima',
          refundAmount: totalPaid,
          version: 1,
        });

      expect(adminCancelRes.status).toBe(200);
      expect(adminCancelRes.body.data.status).toBe('cancelled');
      expect(adminCancelRes.body.data.refundAmount).toBe(totalPaid);
      expect(adminCancelRes.body.data.version).toBe(2);

      const pay = await paymentRepo.findByBookingId(bookingId);
      expect(pay.status).toBe('refunded');
    });
  });

  describe('4. Optimistic Concurrency Control (Version Mismatch 409 STALE_DATA)', () => {
    test('Menolak aksi pembatalan jika version klien usang (stale data)', async () => {
      const start = format(addDays(now, 40), 'yyyy-MM-dd');
      const end = format(addDays(now, 42), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          payment: 'bank_transfer',
        });
      const bookingId = createRes.body.data.id;

      // Klien mengirimkan version 99 (tidak cocok dengan version 1 di server)
      const staleCancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          reason: 'Batal',
          version: 99,
        });

      expect(staleCancelRes.status).toBe(409);
      expect(staleCancelRes.body.error.code).toBe('STALE_DATA');
      expect(staleCancelRes.body.error.message).toMatch(/data sudah berubah/i);
    });
  });

  describe('5. Batas Penyalahgunaan: Maksimal 1 Booking Tunai Belum Diambil', () => {
    test('Pelanggan yang memiliki 1 booking tunai pending ditolak membuat booking tunai baru', async () => {
      const start1 = format(addDays(now, 45), 'yyyy-MM-dd');
      const end1 = format(addDays(now, 47), 'yyyy-MM-dd');

      // Booking tunai pertama (berhasil)
      const cashRes1 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start1,
          endDate: end1,
          payment: 'cash',
        });
      expect(cashRes1.status).toBe(201);
      expect(cashRes1.body.data.paymentMethod).toBe('cash');

      // Booking tunai kedua saat yang pertama masih pending (ditolak 400 MAX_UNCLAIMED_CASH_BOOKING_EXCEEDED)
      const start2 = format(addDays(now, 50), 'yyyy-MM-dd');
      const end2 = format(addDays(now, 52), 'yyyy-MM-dd');

      const cashRes2 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 2,
          startDate: start2,
          endDate: end2,
          payment: 'cash',
        });

      expect(cashRes2.status).toBe(400);
      expect(cashRes2.body.error.code).toBe('MAX_UNCLAIMED_CASH_BOOKING_EXCEEDED');
      expect(cashRes2.body.error.message).toMatch(/masih memiliki pemesanan tunai yang belum diambil/i);

      // Bersihkan: batalkan booking tunai pertama agar tidak memblokir tes selanjutnya
      await request(app)
        .post(`/api/bookings/${cashRes1.body.data.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Batal pemesanan tunai uji' });
    });
  });

  describe('6. Idempotensi Pembatalan Pelanggan', () => {
    test('Memanggil pembatalan ulang pada booking yang sudah cancelled mengembalikan 200 idempotent', async () => {
      const start = format(addDays(now, 55), 'yyyy-MM-dd');
      const end = format(addDays(now, 57), 'yyyy-MM-dd');

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          motorId: 1,
          startDate: start,
          endDate: end,
          payment: 'bank_transfer',
        });
      const bookingId = createRes.body.data.id;

      // Cancel 1
      const res1 = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Batal awal' });
      expect(res1.status).toBe(200);

      // Cancel 2 (Idempotent replay)
      const res2 = await request(app)
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Batal ulang' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('cancelled');
    });
  });
});
