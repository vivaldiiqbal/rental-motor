const crypto = require('crypto');

/**
 * EventTicketManager: Mengelola tiket sekali-pakai (single-use token) berumur 30 detik
 * untuk mengotentikasi EventSource / Server-Sent Events tanpa membocorkan JWT di URL/query.
 */
class EventTicketManager {
  constructor(defaultTtlSeconds = 30) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
    this.tickets = new Map(); // token -> { user, expiresAt }
    
    // Pembersihan tiket kedaluwarsa setiap 60 detik
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Menghasilkan tiket sekali pakai yang terikat ke pengguna.
   * @param {Object} user { id, role, email, name }
   * @param {number} [ttlSeconds]
   * @returns {string} token hex unik
   */
  createTicket(user, ttlSeconds = null) {
    if (!user || !user.id) {
      throw new Error('User harus memiliki ID yang valid untuk membuat tiket SSE.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const ttlMs = (ttlSeconds ? Number(ttlSeconds) : 30) * 1000;
    const expiresAt = Date.now() + ttlMs;

    this.tickets.set(token, {
      user: {
        id: Number(user.id),
        role: user.role || 'customer',
        email: user.email || '',
        name: user.name || '',
      },
      expiresAt,
    });

    return token;
  }

  /**
   * Mengonsumsi tiket (Single-Use). Tiket langsung dihapus sehingga tidak dapat dipakai ulang.
   * @param {string} token
   * @returns {Object|null} user jika valid & belum kedaluwarsa, null jika salah / usang.
   */
  consumeTicket(token) {
    if (!token || typeof token !== 'string') return null;

    const entry = this.tickets.get(token);
    if (!entry) return null;

    // Tiket langsung dihapus seketika (Single-Use Guarantee)
    this.tickets.delete(token);

    if (Date.now() > entry.expiresAt) {
      return null; // Kedaluwarsa
    }

    return entry.user;
  }

  cleanup() {
    const now = Date.now();
    for (const [token, entry] of this.tickets.entries()) {
      if (now > entry.expiresAt) {
        this.tickets.delete(token);
      }
    }
  }

  reset() {
    this.tickets.clear();
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.tickets.clear();
  }
}

const ticketManager = new EventTicketManager(30);

module.exports = ticketManager;
