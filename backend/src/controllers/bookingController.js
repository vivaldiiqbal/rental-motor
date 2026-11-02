const bookingService = require('../services/bookingService');
const { successResponse } = require('../utils/response');

const bookingController = {
  async quote(req, res) {
    const quoteData = await bookingService.getQuote(req.body);
    return successResponse(res, {
      data: quoteData,
    });
  },

  async createBooking(req, res) {
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;
    const booking = await bookingService.createBooking(req.body, req.user.id, idempotencyKey);

    if (booking.isIdempotentReplay) {
      res.setHeader('Idempotent-Replay', 'true');
      return successResponse(res, {
        data: booking,
        statusCode: 200,
        message: 'Pemesanan telah dibuat sebelumnya (idempotent replay).',
      });
    }

    return successResponse(res, {
      data: booking,
      statusCode: 201,
      message: 'Pemesanan sewa motor berhasil dibuat. Silakan lanjutkan ke pembayaran.',
    });
  },

  async getMyBookings(req, res) {
    const result = await bookingService.getMyBookings(req.user.id, req.query);
    return successResponse(res, {
      data: result.items,
      meta: {
        ...result.meta,
        counts: result.counts,
      },
    });
  },

  async getBookingDetail(req, res) {
    const booking = await bookingService.getBookingDetail(req.params.id, req.user);
    return successResponse(res, {
      data: booking,
    });
  },

  async cancelBooking(req, res) {
    const payload = req.body || {};
    const booking = await bookingService.cancelBooking(req.params.id, payload, req.user);
    return successResponse(res, {
      data: booking,
      message: 'Pemesanan berhasil dibatalkan.',
    });
  },

  async getBookingIcs(req, res) {
    const { filename, content } = await bookingService.getBookingIcs(req.params.id, req.user);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  },
};

module.exports = bookingController;
