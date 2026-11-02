const ticketManager = require('../utils/eventTicketManager');
const eventBroadcaster = require('../services/realtime/eventBroadcaster');
const { eventRepo } = require('../repositories');
const { successResponse } = require('../utils/response');
const AppError = require('../utils/AppError');

const eventController = {
  /**
   * POST /api/events/ticket
   * Menghasilkan tiket sekali-pakai berumur 30 detik untuk inisialisasi EventSource browser.
   */
  async createTicket(req, res) {
    if (!req.user) {
      throw new AppError('Pengguna tidak terautentikasi.', 'UNAUTHORIZED', 401);
    }

    const ticket = ticketManager.createTicket(req.user, 30);

    return successResponse(res, {
      data: {
        ticket,
        expiresIn: 30,
      },
      message: 'Tiket koneksi realtime berhasil dibuat.',
    });
  },

  /**
   * GET /api/events
   * Server-Sent Events (SSE) Stream endpoint.
   */
  async streamEvents(req, res) {
    const ticket = req.query.ticket;
    if (!ticket) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TICKET',
          message: 'Tiket koneksi realtime diperlukan pada parameter query.',
        },
      });
    }

    const user = ticketManager.consumeTicket(ticket);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OR_EXPIRED_TICKET',
          message: 'Tiket koneksi realtime tidak valid, sudah dipakai, atau telah kedaluwarsa.',
        },
      });
    }

    // Tangani Last-Event-ID (Catch-up peristiwa terlewat selama terputus)
    const lastEventId = req.headers['last-event-id'] || req.query.lastEventId || null;

    // Daftarkan koneksi ke broadcaster (menangani header SSE, heartbeat, dan limit koneksi)
    const client = eventBroadcaster.registerClient(req, res, user);

    // Kirim peristiwa terlewat jika ada Last-Event-ID
    if (lastEventId && eventRepo) {
      try {
        const missedEvents = await eventRepo.getMissedEvents(lastEventId, user, 24);
        for (const ev of missedEvents) {
          eventBroadcaster.sendSseEvent(client, ev);
        }
      } catch (err) {
        // Jangan putus koneksi jika query catch-up gagal
      }
    }
  },
};

module.exports = eventController;
