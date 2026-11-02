const request = require('supertest');
const app = require('../../src/app');
const ticketManager = require('../../src/utils/eventTicketManager');
const eventBroadcaster = require('../../src/services/realtime/eventBroadcaster');
const { pool } = require('../../db/pool');

describe('Integration Test: Realtime Server-Sent Events (SSE) & Outbox', () => {
  let customerToken;
  let adminToken;
  let customerUser;
  let adminUser;

  beforeAll(async () => {
    ticketManager.reset();
    if (process.env.USE_DB === 'postgres') {
      const { loadSeed } = require('../../db/seeds/loadSeed');
      await loadSeed();
    }

    const custLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    customerToken = custLogin.body.data.token;
    customerUser = custLogin.body.data.user;

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = adminLogin.body.data.token;
    adminUser = adminLogin.body.data.user;
  });

  afterAll(async () => {
    eventBroadcaster.destroy();
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  describe('1. Single-Use 30-Second Ticket Management', () => {
    test('POST /api/events/ticket menghasilkan tiket 30 detik yang valid', async () => {
      const res = await request(app)
        .post('/api/events/ticket')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('ticket');
      expect(res.body.data.expiresIn).toBe(30);
      expect(typeof res.body.data.ticket).toBe('string');
    });

    test('POST /api/events/ticket menolak permintaan tanpa token JWT (401)', async () => {
      const res = await request(app).post('/api/events/ticket');
      expect(res.status).toBe(401);
    });

    test('GET /api/events tanpa tiket ditolak dengan 401 MISSING_TICKET', async () => {
      const res = await request(app).get('/api/events');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MISSING_TICKET');
    });

    test('GET /api/events dengan tiket usang/palsu ditolak 401 INVALID_OR_EXPIRED_TICKET', async () => {
      const res = await request(app).get('/api/events?ticket=fake-expired-ticket-12345');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_TICKET');
    });

    test('Tiket hanya dapat dipakai SATU KALI (Single-Use); pemakaian ulang ditolak 401', async () => {
      // Buat tiket
      const ticketRes = await request(app)
        .post('/api/events/ticket')
        .set('Authorization', `Bearer ${customerToken}`);
      const ticket = ticketRes.body.data.ticket;

      // Pakai pertama kali langsung lewat consumeTicket
      const user1 = ticketManager.consumeTicket(ticket);
      expect(user1).not.toBeNull();
      expect(user1.id).toBe(Number(customerUser.id));

      // Pakai kedua kali dengan tiket yang sama (harus ditolak null / 401)
      const user2 = ticketManager.consumeTicket(ticket);
      expect(user2).toBeNull();

      const apiRes = await request(app).get(`/api/events?ticket=${ticket}`);
      expect(apiRes.status).toBe(401);
      expect(apiRes.body.error.code).toBe('INVALID_OR_EXPIRED_TICKET');
    });
  });

  describe('2. Isolasi Kanal & Otorisasi Pengguna', () => {
    test('Pelanggan hanya boleh menerima event miliknya sendiri atau publik (bebas bocor)', () => {
      const customer = { id: 10, role: 'customer' };
      const otherCustomer = { id: 20, role: 'customer' };
      const admin = { id: 99, role: 'admin' };

      const myEvent = { type: 'booking.updated', userId: 10 };
      const otherEvent = { type: 'booking.updated', userId: 20 };
      const publicEvent = { type: 'motor.availability.changed', userId: null };

      // Pelanggan 10 boleh terima myEvent dan publicEvent
      expect(eventBroadcaster.canUserReceiveEvent(customer, myEvent)).toBe(true);
      expect(eventBroadcaster.canUserReceiveEvent(customer, publicEvent)).toBe(true);

      // Pelanggan 10 DILARANG menerima event milik pelanggan 20 (ISOLASI MUTLAK)
      expect(eventBroadcaster.canUserReceiveEvent(customer, otherEvent)).toBe(false);

      // Admin berhak menerima seluruh event
      expect(eventBroadcaster.canUserReceiveEvent(admin, myEvent)).toBe(true);
      expect(eventBroadcaster.canUserReceiveEvent(admin, otherEvent)).toBe(true);
      expect(eventBroadcaster.canUserReceiveEvent(admin, publicEvent)).toBe(true);
    });
  });
});
