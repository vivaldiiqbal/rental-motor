const gpsAdminService = require('../../services/admin/gpsAdminService');
const { successResponse } = require('../../utils/response');

const gpsAdminController = {
  // STAFF & ADMIN: Peta & Daftar Live
  async getLive(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.getLiveDevices(req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Data pemantauan live GPS berhasil diambil.',
    });
  },

  // STAFF & ADMIN: Riwayat Rute Motor
  async getMotorcyclePositions(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.getMotorcyclePositions(req.params.id, req.query, req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Riwayat rute GPS motor berhasil dimuat.',
    });
  },

  // STAFF & ADMIN: Peringatan GPS
  async listAlerts(req, res) {
    const result = await gpsAdminService.listAlerts(req.query);
    return successResponse(res, {
      data: result.data,
      meta: { total: result.total },
      message: 'Daftar peringatan GPS berhasil diambil.',
    });
  },

  async acknowledgeAlert(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.acknowledgeAlert(req.params.id, req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Peringatan GPS telah diakui oleh petugas.',
    });
  },

  async resolveAlert(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.resolveAlert(req.params.id, req.body, req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Peringatan GPS berhasil ditandai selesai.',
    });
  },

  // KHUSUS ADMIN: Perangkat GPS
  async listDevices(req, res) {
    const result = await gpsAdminService.listDevices(req.query);
    return successResponse(res, {
      data: result.data,
      meta: { total: result.total },
    });
  },

  async createDevice(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.createDevice(req.body, req.user, reqContext);
    return successResponse(res, {
      data: result,
      statusCode: 201,
      message: 'Perangkat GPS berhasil dipasangkan ke unit motor.',
    });
  },

  async updateDevice(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.updateDevice(req.params.id, req.body, req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Data perangkat GPS berhasil diperbarui.',
    });
  },

  async replaceDevice(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.replaceDevice(req.params.id, req.body, req.user, reqContext);
    return successResponse(res, {
      data: result,
      statusCode: 201,
      message: 'Perangkat GPS lama berhasil diganti dengan perangkat baru tanpa kehilangan riwayat motor.',
    });
  },

  // KHUSUS ADMIN: Area Geofence
  async listGeofences(req, res) {
    const result = await gpsAdminService.listGeofences(req.query);
    return successResponse(res, { data: result });
  },

  async createGeofence(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.createGeofence(req.body, req.user, reqContext);
    return successResponse(res, {
      data: result,
      statusCode: 201,
      message: 'Area geofence baru berhasil disimpan.',
    });
  },

  async updateGeofence(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.updateGeofence(req.params.id, req.body, req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Area geofence berhasil diperbarui.',
    });
  },

  async deleteGeofence(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.deleteGeofence(req.params.id, req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Area geofence berhasil dihapus.',
    });
  },

  // KHUSUS ADMIN: Pengaturan GPS
  async getSettings(req, res) {
    const result = await gpsAdminService.getGpsSettings();
    return successResponse(res, { data: result });
  },

  async updateSettings(req, res) {
    const reqContext = { user: req.user, ip: req.ip, headers: req.headers };
    const result = await gpsAdminService.updateGpsSettings(req.body, req.user, reqContext);
    return successResponse(res, {
      data: result,
      message: 'Pengaturan operasional GPS berhasil disimpan.',
    });
  },

  // KHUSUS ADMIN: Log Akses Lokasi
  async getAccessLogs(req, res) {
    const result = await gpsAdminService.getAccessLogs(req.query);
    return successResponse(res, {
      data: result.data,
      meta: { total: result.total },
    });
  },
};

module.exports = gpsAdminController;
