const EventEmitter = require('events');
const { pool } = require('../../../db/pool');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const eventRepo = require('../../repositories')[env.USE_DB === 'postgres' ? 'postgres' : 'memory']?.eventRepo || require(`../../repositories/${env.USE_DB === 'postgres' ? 'postgres' : 'memory'}/eventRepo`);

class EventBroadcaster extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);

    // Map: userId (number) -> Set of active SSE client objects { id, res, req, user, heartbeatTimer }
    this.clientsByUser = new Map();
    this.totalClients = 0;

    // Throttle / Debounce map: key (type:entityId:userId) -> { event, timer }
    this.pendingEvents = new Map();
    this.BATCH_WINDOW_MS = 300; // Gabungkan peristiwa sama dalam 300ms

    // PostgreSQL LISTEN client
    this.pgClient = null;
    this.isListeningPg = false;
    this.reconnectTimer = null;
    this.isDestroyed = false;

    // Mulai mendengarkan PostgreSQL NOTIFY jika di environment postgres non-test
    // Di environment test, listener diinisialisasi otomatis saat client mendaftar
    if (env.USE_DB === 'postgres' && process.env.NODE_ENV !== 'test') {
      this.initPgListener();
    }
  }

  /**
   * Menginisialisasi listener PostgreSQL NOTIFY channel 'rodakita_events'
   * dengan proteksi pemulihan koneksi otomatis (auto-reconnect).
   */
  async initPgListener() {
    if (this.isDestroyed || this.isListeningPg) return;

    try {
      this.pgClient = await pool.connect();
      this.isListeningPg = true;

      await this.pgClient.query('LISTEN rodakita_events');
      logger.info('[REALTIME] Terhubung ke PostgreSQL channel LISTEN rodakita_events');

      this.pgClient.on('notification', (msg) => {
        if (msg.channel === 'rodakita_events' && msg.payload) {
          try {
            const rawEvent = JSON.parse(msg.payload);
            this.handleIncomingEvent(rawEvent);
          } catch (err) {
            logger.error('[REALTIME] Gagal mengurai payload NOTIFY:', err);
          }
        }
      });

      this.pgClient.on('error', (err) => {
        logger.warn('[REALTIME] PostgreSQL listener client mengalami error:', err.message);
        this.cleanupPgListener();
        this.schedulePgReconnect();
      });

      this.pgClient.on('end', () => {
        this.cleanupPgListener();
        this.schedulePgReconnect();
      });
    } catch (err) {
      logger.warn('[REALTIME] Gagal menginisialisasi PostgreSQL LISTEN, mencoba kembali...', err.message);
      this.cleanupPgListener();
      this.schedulePgReconnect();
    }
  }

  cleanupPgListener() {
    this.isListeningPg = false;
    if (this.pgClient) {
      try {
        this.pgClient.removeAllListeners();
        this.pgClient.release();
      } catch (e) {}
      this.pgClient = null;
    }
  }

  schedulePgReconnect(delay = 2000) {
    if (this.isDestroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initPgListener();
    }, delay);
    if (this.reconnectTimer.unref) this.reconnectTimer.unref();
  }

  /**
   * Menerima event mentah (dari PostgreSQL NOTIFY atau bus in-memory)
   * Menggabungkan peristiwa identik dalam jendela 300 ms (Throttling / Debouncing)
   */
  handleIncomingEvent(event) {
    if (!event || !event.type) return;

    // Normalisasi struktur event minimal (Non-PII)
    const normalized = {
      id: Number(event.id || Date.now()),
      type: String(event.type),
      entityId: event.entityId !== undefined && event.entityId !== null ? String(event.entityId) : null,
      userId: event.userId !== undefined && event.userId !== null ? Number(event.userId) : null,
      version: Number(event.version || 1),
      timestamp: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
      payload: event.payload || {},
    };

    // Kunci agregasi debounce: gabungkan peristiwa sama persis dalam 300ms
    const key = `${normalized.type}:${normalized.entityId || 'null'}:${normalized.userId || 'null'}`;
    const existing = this.pendingEvents.get(key);

    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.pendingEvents.delete(key);
      this.dispatchToClients(normalized);
    }, this.BATCH_WINDOW_MS);

    if (timer.unref) timer.unref();

    this.pendingEvents.set(key, { event: normalized, timer });
  }

  /**
   * Menyiarkan event ke klien yang tersambung sesuai aturan isolasi saluran.
   */
  dispatchToClients(event) {
    // 1. Pancarkan ke bus internal event emitter (untuk observer / unit test)
    this.emit('broadcast', event);

    // 2. Iterasi seluruh pengguna aktif
    for (const [userId, clientSet] of this.clientsByUser.entries()) {
      for (const client of clientSet) {
        if (!this.canUserReceiveEvent(client.user, event)) {
          continue;
        }
        this.sendSseEvent(client, event);
      }
    }
  }

  /**
   * Aturan Otorisasi Saluran & Isolasi Pengguna:
   * - Admin & Staff berhak menerima seluruh peristiwa.
   * - Pelanggan HANYA menerima:
   *   1. Peristiwa miliknya sendiri (event.userId === user.id)
   *   2. Peristiwa publik / ketersediaan (event.userId === null)
   * - Pelanggan A TIDAK PERNAH menerima peristiwa Pelanggan B.
   */
  canUserReceiveEvent(user, event) {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'staff') {
      return true;
    }

    // Role Customer:
    // Pelanggan TIDAK PERNAH menerima peristiwa GPS apa pun (posisi, alert, telemetri)
    if (event.type && (event.type.startsWith('gps.') || event.type === 'gps_alert')) {
      return false;
    }

    if (event.userId === null) {
      return true; // Peristiwa publik (misal: motor.availability.changed, settings.changed)
    }

    return Number(event.userId) === Number(user.id);
  }

  /**
   * Mendaftarkan koneksi SSE baru.
   * Membatasi maksimal 5 koneksi aktif per pengguna.
   */
  registerClient(req, res, user) {
    if (env.USE_DB === 'postgres' && !this.isListeningPg) {
      this.initPgListener();
    }

    const userId = Number(user.id);

    if (!this.clientsByUser.has(userId)) {
      this.clientsByUser.set(userId, new Set());
    }

    const userClients = this.clientsByUser.get(userId);

    // Batas 5 koneksi per pengguna: tutup koneksi terlama bila melebihi 5
    if (userClients.size >= 5) {
      const oldestClient = userClients.values().next().value;
      if (oldestClient) {
        this.closeClient(oldestClient, 'MAX_CONNECTIONS_EXCEEDED');
      }
    }

    const clientId = `sse-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Set SSE Headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering di Nginx
    });
    res.flushHeaders();

    // Heartbeat ping berkala setiap 25 detik
    const heartbeatTimer = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeatTimer);
        return;
      }
      try {
        res.write(': ping\n\n');
      } catch (err) {
        clearInterval(heartbeatTimer);
      }
    }, 25000);

    if (heartbeatTimer.unref) heartbeatTimer.unref();

    const client = {
      id: clientId,
      userId,
      user,
      req,
      res,
      heartbeatTimer,
      connectedAt: Date.now(),
    };

    userClients.add(client);
    this.totalClients++;

    // Kirim event pembuka koneksi (connected)
    this.sendRawSse(res, 'connected', {
      clientId,
      userId,
      role: user.role,
      serverTime: new Date().toISOString(),
      heartbeatIntervalSec: 25,
    });

    // Cleanup saat koneksi putus
    req.on('close', () => {
      this.removeClient(client);
    });

    res.on('error', (err) => {
      logger.warn(`[REALTIME] SSE connection error for user ${userId}:`, err.message);
      this.removeClient(client);
    });

    return client;
  }

  removeClient(client) {
    if (!client) return;

    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
      client.heartbeatTimer = null;
    }

    const userClients = this.clientsByUser.get(client.userId);
    if (userClients) {
      userClients.delete(client);
      if (userClients.size === 0) {
        this.clientsByUser.delete(client.userId);
      }
    }

    this.totalClients = Math.max(0, this.totalClients - 1);
  }

  closeClient(client, reason = 'NORMAL_CLOSURE') {
    if (!client) return;
    try {
      this.sendRawSse(client.res, 'close', { reason });
      if (!client.res.writableEnded) {
        client.res.end();
      }
    } catch (e) {}
    this.removeClient(client);
  }

  sendSseEvent(client, event) {
    if (!client || !client.res || client.res.writableEnded || client.res.destroyed) {
      this.removeClient(client);
      return;
    }

    const idStr = event.id ? `id: ${event.id}\n` : '';
    const eventType = `event: ${event.type}\n`;
    const dataStr = `data: ${JSON.stringify(event)}\n\n`;

    try {
      client.res.write(`${idStr}${eventType}${dataStr}`);
    } catch (err) {
      this.removeClient(client);
    }
  }

  sendRawSse(res, eventName, data, id = null) {
    if (!res || res.writableEnded || res.destroyed) return;
    const idStr = id ? `id: ${id}\n` : '';
    const eventStr = eventName ? `event: ${eventName}\n` : '';
    const dataStr = `data: ${JSON.stringify(data)}\n\n`;

    try {
      res.write(`${idStr}${eventStr}${dataStr}`);
    } catch (err) {}
  }

  /**
   * Mempublikasikan event baru dari aplikasi (pola Outbox).
   * Menulis ke database events di dalam transaksi yang sama.
   */
  async publish(txOrClient, eventData) {
    const recorded = await eventRepo.recordEvent(eventData, txOrClient?.client || txOrClient);

    // Jika driver memory (atau saat diuji di memory), teruskan langsung ke handler
    if (env.USE_DB === 'memory' || !this.isListeningPg) {
      this.handleIncomingEvent(recorded);
    }

    return recorded;
  }

  /**
   * Helper untuk menyiarkan event secara langsung (mis. dalam pengujian / trigger)
   */
  broadcast(event) {
    this.handleIncomingEvent(event);
  }

  /**
   * Mengembalikan jumlah total koneksi SSE aktif
   */
  getActiveConnectionsCount() {
    let count = 0;
    for (const clientSet of this.clientsByUser.values()) {
      count += clientSet.size;
    }
    return count;
  }

  destroy() {
    this.isDestroyed = true;
    this.cleanupPgListener();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const item of this.pendingEvents.values()) {
      clearTimeout(item.timer);
    }
    this.pendingEvents.clear();

    for (const clientSet of this.clientsByUser.values()) {
      for (const client of clientSet) {
        this.closeClient(client, 'SERVER_SHUTDOWN');
      }
    }
    this.clientsByUser.clear();
  }
}

const broadcaster = new EventBroadcaster();

module.exports = broadcaster;
