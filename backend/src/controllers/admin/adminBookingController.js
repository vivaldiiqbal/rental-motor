const adminBookingService = require('../../services/admin/adminBookingService');
const handoverService = require('../../services/admin/handoverService');
const returnService = require('../../services/admin/returnService');
const { successResponse } = require('../../utils/response');

const adminBookingController = {
  async getBookings(req, res) {
    const result = await adminBookingService.getBookings(req.query, {
      page: req.query?.page,
      limit: req.query?.limit,
    });
    return successResponse(res, {
      data: result.items,
      meta: result.meta || {
        total: result.total,
        page: result.page,
        limit: result.limit,
        statusCounts: result.statusCounts,
      },
    });
  },

  async getBookingById(req, res) {
    const booking = await adminBookingService.getBookingById(req.params.id, req.user);
    return successResponse(res, { data: booking });
  },

  async confirmManualPayment(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await adminBookingService.confirmManualPayment(req.params.id, req.body, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Pembayaran manual berhasil dikonfirmasi.',
    });
  },

  async handover(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await handoverService.handoverMotor(req.params.id, req.body, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Serah terima unit berhasil dicatat. Status sewa kini aktif.',
    });
  },

  async approveAndHandover(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await adminBookingService.quickApproveAndHandover(req.params.id, req.body, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Pemesanan disetujui & kunci motor berhasil diserahkan. Status sewa kini aktif.',
    });
  },

  async rejectBooking(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await adminBookingService.rejectBooking(req.params.id, req.body, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Pesanan berhasil ditolak. Slot unit motor kembali tersedia.',
    });
  },

  async completeReturn(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await adminBookingService.completeReturn(req.params.id, req.body, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Pengembalian unit berhasil dicatat dan deposit jaminan telah dikembalikan. Transaksi sewa selesai.',
    });
  },

  async returnPreview(req, res) {
    const result = await returnService.previewReturn(req.params.id);
    return successResponse(res, { data: result });
  },

  async returnMotor(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await returnService.returnMotor(req.params.id, req.body, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Pengembalian unit berhasil dicatat. Transaksi sewa selesai.',
    });
  },

  async cancelBooking(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await adminBookingService.cancelBooking(req.params.id, req.body, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Pemesanan berhasil dibatalkan oleh admin.',
    });
  },

  async addNote(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const note = await adminBookingService.addNote(req.params.id, req.body.note, req.user, reqInfo);
    return successResponse(res, {
      data: note,
      statusCode: 201,
      message: 'Catatan internal berhasil disimpan.',
    });
  },

  async markDepositRefunded(req, res) {
    const reqInfo = { ip: req.ip, userAgent: req.headers?.['user-agent'] };
    const result = await adminBookingService.markDepositRefunded(req.params.id, req.user, reqInfo);
    return successResponse(res, {
      data: result,
      message: 'Deposit berhasil ditandai telah dikembalikan.',
    });
  },

  async exportCsv(req, res) {
    const { csv, filename } = await adminBookingService.exportBookingsCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(csv);
  },
};

module.exports = adminBookingController;
