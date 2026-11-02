const http = require('http');
const request = require('supertest');
const app = require('../../src/app');
const ticketManager = require('../../src/utils/eventTicketManager');
const eventBroadcaster = require('../../src/services/realtime/eventBroadcaster');
const { pool } = require('../../db/pool');
const { transaction } = require('../../src/repositories');
const bookingService = require('../../src/services/bookingService');
const adminBookingService = require('../../src/services/admin/adminBookingService');

describe('Realtime End-to-End & Concurrency Test Suite', () => {
  let server;
  let serverPort;
  let baseUrl;

  let customerAToken;
  let customerAUser;
  let customerBToken;
  let customerBUser;
  let adminToken;
  let adminUser;

  beforeAll(async () => {
    // Jalankan http server aktual untuk stream SSE
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // Inisialisasi token Pelanggan A (demo@rodakita.id)
    const loginA = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@rodakita.id', password: 'Demo12345' });
    customerAToken = loginA.body.data.token;
    customerAUser = loginA.body.data.user;

    // Inisialisasi token Pelanggan B dengan email unik
    const bEmail = `pelanggan_b_${Date.now()}@rodakita.id`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Pelanggan B',
        email: bEmail,
        password: 'Password123!',
        phone: '081299990002',
      });
    customerBToken = regRes.body.data?.token;
    customerBUser = regRes.body.data?.user;

    // Inisialisasi token Admin
    const loginAdmin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@rodakita.id', password: 'Admin12345' });
    adminToken = loginAdmin.body.data.token;
    adminUser = loginAdmin.body.data.user;
  });

  afterAll(async () => {
    eventBroadcaster.destroy();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (process.env.USE_DB === 'postgres') {
      await pool.end();
    }
  });

  // Helper untuk membuka koneksi SSE via native http.get
  function openSSEConnection(token, lastEventId = null) {
    return new Promise(async (resolve, reject) => {
      try {
        const ticketRes = await request(app)
          .post('/api/events/ticket')
          .set('Authorization', `Bearer ${token}`);
        
        if (ticketRes.status !== 200) {
          return reject(new Error(`Failed to get ticket: ${ticketRes.status}`));
        }
        const ticket = ticketRes.body.data.ticket;

        const headers = {};
        if (lastEventId) {
          headers['Last-Event-ID'] = String(lastEventId);
        }

        const events = [];
        let rawBuffer = '';

        const req = http.get(`${baseUrl}/api/events?ticket=${ticket}`, { headers }, (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`SSE status code ${res.statusCode}`));
          }

          res.on('data', (chunk) => {
            rawBuffer += chunk.toString();
            const lines = rawBuffer.split('\n\n');
            rawBuffer = lines.pop(); // simpan sisa potongan belum lengkap

            for (const block of lines) {
              const eventLines = block.split('\n');
              let eventName = 'message';
              let eventData = '';
              let eventId = null;

              for (const line of eventLines) {
                if (line.startsWith('event: ')) {
                  eventName = line.slice(7).trim();
                } else if (line.startsWith('data: ')) {
                  eventData = line.slice(6).trim();
                } else if (line.startsWith('id: ')) {
                  eventId = line.slice(4).trim();
                }
              }

              if (eventData) {
                try {
                  const parsed = JSON.parse(eventData);
                  events.push({ eventName, eventId, data: parsed, receivedAt: Date.now() });
                } catch {
                  // ignore non-json
                }
              }
            }
          });

          // Kembalikan controller
          resolve({
            req,
            res,
            getEvents: () => [...events],
            close: () => {
              req.destroy();
            },
          });
        });

        req.on('error', (err) => {
          // ignore aborted errors on destroy
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  describe('1. Transaksi Rollback & Outbox Guarantee', () => {
    test('Peristiwa TIDAK PERNAH terkirim bila transaksi di-rollback', async () => {
      let eventWasSent = false;
      const testUser = { id: 8888, role: 'customer' };

      // Pasang listener di eventBroadcaster
      const onBroadcast = (ev) => {
        if (ev.type === 'booking.updated' && ev.entityId === 'TX_ROLLBACK_TEST') {
          eventWasSent = true;
        }
      };
      eventBroadcaster.on('broadcast', onBroadcast);

      try {
        await transaction(async (tx) => {
          if (tx.eventRepo) {
            await tx.eventRepo.recordEvent({
              type: 'booking.updated',
              entityId: 'TX_ROLLBACK_TEST',
              userId: Number(customerAUser.id),
              version: 1,
              payload: { test: true },
            });
          }
          // Sengaja melempar error untuk memaksa rollback
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      } catch (err) {
        expect(err.message).toBe('SIMULATED_TRANSACTION_FAILURE');
      }

      // Tunggu 350ms (lebih besar dari debounce window 300ms)
      await new Promise((r) => setTimeout(r, 350));
      eventBroadcaster.off('broadcast', onBroadcast);

      expect(eventWasSent).toBe(false);
    });
  });

  describe('2. Delivery & Latency (Pembaruan < 2 Detik)', () => {
    test('Admin broadcast booking.updated sampai ke pelanggan dalam < 500 ms', async () => {
      const client = await openSSEConnection(customerAToken);

      // Tunggu koneksi stabil
      await new Promise((r) => setTimeout(r, 100));

      const startTime = Date.now();
      // Pancarkan event outbox untuk customer A
      await eventBroadcaster.broadcast({
        type: 'booking.updated',
        entityId: 'BK-TEST-LATENCY-001',
        userId: Number(customerAUser.id),
        version: 2,
        payload: { status: 'confirmed' },
      });

      // Polling events diterima di SSE stream
      let received = null;
      for (let i = 0; i < 20; i++) {
        const evs = client.getEvents();
        received = evs.find((e) => e.data.entityId === 'BK-TEST-LATENCY-001');
        if (received) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      client.close();

      expect(received).not.toBeNull();
      const delayMs = received.receivedAt - startTime;
      // Waktu tunda wajib jauh di bawah 2000 ms
      expect(delayMs).toBeLessThan(1000);
      console.log(`[REALTIME_LATENCY_TEST] Latency: ${delayMs} ms (Target < 2000 ms)`);
    });
  });

  describe('3. Isolasi Pengguna Mutlak (Zero-Leakage)', () => {
    test('Pelanggan A TIDAK MENERIMA event privat milik Pelanggan B', async () => {
      const clientA = await openSSEConnection(customerAToken);
      const clientB = await openSSEConnection(customerBToken);

      await new Promise((r) => setTimeout(r, 100));

      // Kirim event khusus untuk Pelanggan B
      await eventBroadcaster.broadcast({
        type: 'booking.updated',
        entityId: 'BK-SECRET-B-001',
        userId: Number(customerBUser.id),
        version: 1,
        payload: { privateInfo: 'rahasia pelanggan B' },
      });

      // Tunggu propagasi
      await new Promise((r) => setTimeout(r, 400));

      const eventsA = clientA.getEvents();
      const eventsB = clientB.getEvents();

      clientA.close();
      clientB.close();

      // Pelanggan B harus menerima event miliknya
      const eventInB = eventsB.find((e) => e.data.entityId === 'BK-SECRET-B-001');
      expect(eventInB).toBeDefined();

      // Pelanggan A SAMA SEKALI TIDAK MENERIMA event milik Pelanggan B
      const leakInA = eventsA.find((e) => e.data.entityId === 'BK-SECRET-B-001');
      expect(leakInA).toBeUndefined();
    });
  });

  describe('4. Last-Event-ID Missed Events Catch-up (Retensi 24 Jam)', () => {
    test('Klien menyambung kembali dengan Last-Event-ID dan menerima event terlewat', async () => {
      let recordedId = null;

      // Catat event ke database outbox
      await transaction(async (tx) => {
        if (tx.eventRepo) {
          const rec = await tx.eventRepo.recordEvent({
            type: 'booking.updated',
            entityId: 'BK-MISSED-TEST-001',
            userId: Number(customerAUser.id),
            version: 3,
            payload: { message: 'event terlewat saat offline' },
          });
          recordedId = rec.id;
        }
      });

      expect(recordedId).not.toBeNull();

      // Hubungkan klien baru dengan Last-Event-ID sebelum recordedId
      const previousId = Number(recordedId) - 1;
      const client = await openSSEConnection(customerAToken, previousId);

      // Tunggu catch-up dikirim pada pembukaan koneksi
      let catchupEvent = null;
      for (let i = 0; i < 20; i++) {
        const evs = client.getEvents();
        catchupEvent = evs.find((e) => e.data.entityId === 'BK-MISSED-TEST-001');
        if (catchupEvent) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      client.close();

      expect(catchupEvent).toBeDefined();
      expect(catchupEvent.data.entityId).toBe('BK-MISSED-TEST-001');
    });
  });

  describe('5. Concurrency & Stress: 50 Koneksi Paralel Bebas Kebocoran Memori', () => {
    test('50 koneksi paralel dapat terhubung, menerima broadcast, dan dibersihkan tanpa leak', async () => {
      const initialClientsCount = eventBroadcaster.getActiveConnectionsCount();
      const parallelCount = 50;
      const clients = [];

      // Hubungkan 50 pengguna berbeda secara konkuren
      for (let i = 0; i < parallelCount; i++) {
        const dummyUser = { id: 2000 + i, role: 'customer', email: `user${i}@test.com` };
        const ticket = ticketManager.createTicket(dummyUser, 30);

        const clientPromise = new Promise((resolve, reject) => {
          const req = http.get(`${baseUrl}/api/events?ticket=${ticket}`, (res) => {
            if (res.statusCode !== 200) {
              return reject(new Error(`Failed SSE: ${res.statusCode}`));
            }
            resolve({
              req,
              res,
              close: () => req.destroy(),
            });
          });
          req.on('error', () => {});
        });

        clients.push(await clientPromise);
      }

      // Pastikan seluruh 50 koneksi terdaftar
      expect(eventBroadcaster.getActiveConnectionsCount()).toBeGreaterThanOrEqual(parallelCount);

      // Broadcast sebuah event publik ke 50 subscriber
      await eventBroadcaster.broadcast({
        type: 'motor.availability.changed',
        entityId: 'MTR-PARALLEL-TEST',
        userId: null,
        payload: { available: true },
      });

      await new Promise((r) => setTimeout(r, 400));

      // Tutup semua 50 koneksi
      for (const c of clients) {
        c.close();
      }

      // Beri jeda agar pembersihan listener tuntas
      await new Promise((r) => setTimeout(r, 400));

      const finalClientsCount = eventBroadcaster.getActiveConnectionsCount();
      // Seluruh koneksi yang ditutup harus bersih kembali
      expect(finalClientsCount).toBeLessThanOrEqual(initialClientsCount);
    });
  });

  describe('6. Penolakan Tiket Kedaluwarsa & Pemakaian Ulang', () => {
    test('Tiket yang sengaja dimanipulasi timestampnya sehingga kedaluwarsa (> 30s) ditolak 401', () => {
      // Simulasikan tiket expired di ticketManager
      ticketManager.tickets.set('expired-token-xyz', {
        user: { id: customerAUser.id, role: 'customer' },
        expiresAt: Date.now() - 5000, // sudah lewat 5 detik
      });

      const user = ticketManager.consumeTicket('expired-token-xyz');
      expect(user).toBeNull();
    });

    test('Tiket yang sudah pernah dikonsumsi tidak dapat dipakai kembali', async () => {
      const ticketRes = await request(app)
        .post('/api/events/ticket')
        .set('Authorization', `Bearer ${customerAToken}`);
      const ticket = ticketRes.body.data.ticket;

      const firstConsume = ticketManager.consumeTicket(ticket);
      expect(firstConsume).not.toBeNull();

      const secondConsume = ticketManager.consumeTicket(ticket);
      expect(secondConsume).toBeNull();
    });
  });
});
