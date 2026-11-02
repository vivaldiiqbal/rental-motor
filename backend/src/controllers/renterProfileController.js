const renterProfileService = require('../services/renterProfileService');

const renterProfileController = {
  async getMyProfile(req, res) {
    const data = await renterProfileService.getProfile(req.user.id);
    res.json({
      success: true,
      data: data.profile,
      readiness: data.readiness,
    });
  },

  async updateMyProfile(req, res) {
    const result = await renterProfileService.updateProfile(req.user.id, req.body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: result.resetDocsToPending
        ? 'Profil berhasil diperbarui. Status dokumen dikembalikan ke antrean verifikasi karena perubahan data identitas.'
        : 'Profil penyewa berhasil diperbarui.',
      data: result.profile,
      readiness: result.readiness,
      resetDocsToPending: result.resetDocsToPending,
    });
  },

  async getMyReadiness(req, res) {
    const readiness = await renterProfileService.renterReadiness(req.user.id);
    res.json({
      success: true,
      data: readiness,
    });
  },

  async getUserProfileByAdmin(req, res) {
    const targetUserId = Number(req.params.id);
    const data = await renterProfileService.getProfile(targetUserId);
    res.json({
      success: true,
      data: {
        profile: data.profile,
        readiness: data.readiness,
      },
    });
  },
};

module.exports = renterProfileController;
