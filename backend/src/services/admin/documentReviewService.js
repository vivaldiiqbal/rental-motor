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

  async getDocumentFile(userId, type, actor = {}, reqInfo = {}) {
    const doc = await documentRepo.findByUserIdAndType(userId, type);
    if (!doc) {
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
      ip: reqInfo?.ip,
      userAgent: reqInfo?.userAgent,
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

    // Fallback jika file fisik demo/seed belum pernah diunggah ke disk
    const { Readable } = require('stream');
    const label = type === 'ktp' ? 'KTP (KARTU TANDA PENDUDUK)' : 'SIM C (SURAT IZIN MENGEMUDI)';
    const statusColor = doc.status === 'verified' ? '#4ade80' : doc.status === 'rejected' ? '#f87171' : '#fbbf24';
    const statusText = doc.status === 'verified' ? '✓ Terverifikasi Sistem' : doc.status === 'rejected' ? '✕ Ditolak' : '⏳ Menunggu Verifikasi';
    const svgBadge = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
      <rect width="600" height="380" rx="16" fill="#1e293b"/>
      <rect x="20" y="20" width="560" height="340" rx="12" fill="#0f172a" stroke="#334155" stroke-width="2"/>
      <text x="50" y="70" fill="#f8fafc" font-size="20" font-family="sans-serif" font-weight="bold">REPUBLIK INDONESIA</text>
      <text x="50" y="100" fill="#38bdf8" font-size="14" font-family="sans-serif" font-weight="bold">${label}</text>
      <rect x="50" y="130" width="120" height="150" rx="8" fill="#334155"/>
      <circle cx="110" cy="180" r="30" fill="#64748b"/>
      <path d="M70 250 C70 220, 150 220, 150 250 Z" fill="#64748b"/>
      <text x="200" y="150" fill="#94a3b8" font-size="12" font-family="sans-serif">ID Pengguna</text>
      <text x="200" y="175" fill="#f8fafc" font-size="16" font-family="monospace" font-weight="bold">Pengguna #${userId}</text>
      <text x="200" y="210" fill="#94a3b8" font-size="12" font-family="sans-serif">Status Dokumen</text>
      <text x="200" y="235" fill="${statusColor}" font-size="14" font-family="sans-serif" font-weight="bold">${statusText}</text>
      <text x="200" y="270" fill="#64748b" font-size="11" font-family="sans-serif">Enkripsi Privat RodaKita MVP v2.0</text>
    </svg>`;

    return {
      stream: Readable.from([svgBadge]),
      contentType: 'image/svg+xml',
      filename: `dokumen-${userId}-${type}.svg`,
      filePath: null,
    };
  },

  async verifyDocument(userId, type, payload = {}, actor = {}, reqInfo = {}) {
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
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
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
