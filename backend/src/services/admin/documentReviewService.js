const fs = require('fs');
const path = require('path');
const AppError = require('../../utils/AppError');
const { documentRepo, userRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const { verifyImageMagicBytes } = require('../../utils/magicBytes');
const eventBroadcaster = require('../realtime/eventBroadcaster');

const documentReviewService = {
  async getDocuments(filter = {}, paging = {}) {
    return documentRepo.findAll(filter, paging);
  },

  async getDocumentFile(userId, type, actorOrContext = {}, reqInfo = {}) {
    const actor = actorOrContext?.user || actorOrContext || {};
    const info = {
      ip: reqInfo?.ip || actorOrContext?.ip,
      userAgent: reqInfo?.userAgent || actorOrContext?.headers?.['user-agent'],
    };

    const doc = await documentRepo.findByUserIdAndType(userId, type);
    if (!doc || doc.status === 'not_uploaded') {
      throw new AppError(`Berkas dokumen ${type.toUpperCase()} tidak ditemukan.`, 'NOT_FOUND', 404);
    }

    const env = require('../../config/env');
    // Cari lokasi fisik berkas di beberapa kemungkinan direktori
    const candidatePaths = [
      doc.filePath,
      doc.storedName ? path.resolve(env.UPLOAD_PATH, 'documents', doc.storedName) : null,
      doc.storedName ? path.resolve(env.UPLOAD_PATH, doc.storedName) : null,
      doc.filePath ? path.resolve(process.cwd(), doc.filePath) : null,
      doc.storedName ? path.resolve(__dirname, '../../../uploads/documents', doc.storedName) : null,
      doc.storedName ? path.resolve(__dirname, '../../../../uploads/documents', doc.storedName) : null,
      doc.storedName ? path.resolve(__dirname, '../../uploads/documents', doc.storedName) : null,
      doc.storedName ? path.resolve(__dirname, '../../../backend/uploads/documents', doc.storedName) : null,
    ].filter(Boolean);

    const resolvedPath = candidatePaths.find((p) => fs.existsSync(p));

    // Catat log audit akses berkas privat
    await recordAudit(null, {
      actorId: actor?.id,
      actorRole: actor?.role,
      actorName: actor?.name,
      action: 'VIEW_DOCUMENT_FILE',
      entityType: 'Document',
      entityId: `${userId}_${type}`,
      details: `Mengakses berkas privat ${type.toUpperCase()} pengguna #${userId}`,
      ip: info?.ip,
      userAgent: info?.userAgent,
    });

    if (resolvedPath && fs.existsSync(resolvedPath)) {
      const magic = verifyImageMagicBytes(resolvedPath);
      const mimeType = magic.valid ? magic.mime : 'image/jpeg';
      const safeFilename = `dokumen-${userId}-${type}.${magic.valid ? magic.format : 'jpg'}`;

      return {
        stream: fs.createReadStream(resolvedPath),
        contentType: mimeType,
        filename: safeFilename,
        filePath: resolvedPath,
      };
    }

    throw new AppError(`Berkas fisik dokumen ${type.toUpperCase()} tidak ditemukan di server.`, 'NOT_FOUND', 404);
  },

  async verifyDocument(userId, type, payload = {}, actorOrContext = {}, reqInfo = {}) {
    const actor = actorOrContext?.user || actorOrContext || {};
    const info = {
      ip: reqInfo?.ip || actorOrContext?.ip,
      userAgent: reqInfo?.userAgent || actorOrContext?.headers?.['user-agent'],
    };
    const action = payload.action; // 'approve' | 'reject' | 'verify'
    const isApproved = action === 'approve' || action === 'verified';
    const newStatus = isApproved ? 'verified' : 'rejected';

    const rejectionReason = payload.rejectionReason || payload.note || '';

    if (!isApproved) {
      if (!rejectionReason || !rejectionReason.trim()) {
        throw new AppError('Alasan penolakan dokumen wajib diisi.', 'VALIDATION_ERROR', 400);
      }
      if (rejectionReason.trim().length > 300) {
        throw new AppError('Alasan penolakan maksimal 300 karakter.', 'VALIDATION_ERROR', 400);
      }
    }

    return transaction(async (tx) => {
      const user = await tx.userRepo.findById(userId);
      if (!user) {
        throw new AppError('Pengguna tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404);
      }

      const verifiedData = payload.verifiedData || null;

      const updated = await tx.documentRepo.updateStatus(userId, type, newStatus, {
        rejectionReason: isApproved ? null : rejectionReason.trim(),
        reviewerId: actor.id,
        verifiedData,
      });

      // Hitung ulang status ringkasan dokumen pengguna
      const allDocs = await tx.documentRepo.findByUserId(userId);
      const ktp = allDocs.find((d) => d.type === 'ktp');
      const sim = allDocs.find((d) => d.type === 'sim');

      const isAllVerified = ktp?.status === 'verified' && sim?.status === 'verified';

      // Sinkronkan ke objek pengguna
      await tx.userRepo.update(userId, {
        documents: {
          ktp: ktp?.status || 'not_uploaded',
          sim: sim?.status || 'not_uploaded',
        },
        documentsVerified: isAllVerified,
      });

      // Catat log audit
      await recordAudit(tx.auditRepo, {
        actorId: actor.id,
        actorRole: actor.role,
        actorName: actor.name,
        action: isApproved ? 'VERIFY_DOCUMENT' : 'REJECT_DOCUMENT',
        entityType: 'Document',
        entityId: `${userId}_${type}`,
        before: { type, previousStatus: user.documents?.[type] || 'not_uploaded' },
        after: { type, status: newStatus, rejectionReason: isApproved ? null : rejectionReason.trim() },
        details: isApproved
          ? `Menyetujui dokumen ${type.toUpperCase()} pengguna #${user.id} (${user.name})`
          : `Menolak dokumen ${type.toUpperCase()} pengguna #${user.id}: ${rejectionReason.trim()}`,
        ip: info.ip,
        userAgent: info.userAgent,
      });

      // Realtime Outbox Events: Review Dokumen
      await eventBroadcaster.publish(tx, {
        type: 'document.updated',
        entityId: `${userId}_${type}`,
        userId: Number(userId),
        payload: { userId: Number(userId), type, status: newStatus },
      });
      await eventBroadcaster.publish(tx, {
        type: 'counters.changed',
        entityId: 'documents',
        userId: null,
        payload: { action: 'document_reviewed' },
      });

      return {
        userId,
        type,
        status: newStatus,
        documents: {
          ktp: ktp?.status || 'not_uploaded',
          sim: sim?.status || 'not_uploaded',
        },
        rejectionReason: isApproved ? null : rejectionReason.trim(),
        verifiedData,
      };
    });
  },
};

module.exports = documentReviewService;
