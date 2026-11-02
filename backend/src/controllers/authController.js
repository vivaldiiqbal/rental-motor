const path = require('path');
const authService = require('../services/authService');
const documentService = require('../services/documentService');
const { successResponse } = require('../utils/response');

const authController = {
  async register(req, res) {
    const data = await authService.register(req.body);
    return successResponse(res, {
      data,
      statusCode: 201,
      message: 'Registrasi berhasil.',
    });
  },

  async login(req, res) {
    const { email, password } = req.body;
    const data = await authService.login(email, password);
    return successResponse(res, {
      data,
      message: 'Login berhasil.',
    });
  },

  async logout(req, res) {
    // Stateless token, kembalikan 204 No Content
    return res.status(204).send();
  },

  async getMe(req, res) {
    const userWithDocs = await authService.getMe(req.user.id);
    return successResponse(res, {
      data: userWithDocs,
    });
  },

  async updateMe(req, res) {
    const updated = await authService.updateMe(req.user.id, req.body);
    return successResponse(res, {
      data: updated,
      message: 'Profil berhasil diperbarui.',
    });
  },

  async updatePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    await authService.updatePassword(req.user.id, currentPassword, newPassword);
    return res.status(204).send();
  },

  async forgotPassword(req, res) {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    return successResponse(res, {
      data: result,
      message: result.message,
    });
  },

  async uploadDocuments(req, res) {
    const docsStatus = await documentService.handleDocumentsUpload(req.user.id, req.uploadedDocs);
    return successResponse(res, {
      data: docsStatus,
      message: 'Dokumen berhasil diunggah dan sedang dalam proses verifikasi.',
    });
  },

  async getDocument(req, res) {
    const { type } = req.params;
    const docData = await documentService.getDocumentFile(req.user.id, type, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', docData.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${docData.filename}"`);
    return docData.stream.pipe(res);
  },

  async getMyDocuments(req, res) {
    const data = await documentService.getMyDocuments(req.user.id);
    return successResponse(res, {
      data,
    });
  },
};

module.exports = authController;
