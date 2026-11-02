const fs = require('fs');
const { transaction, userRepo, documentRepo } = require('../repositories');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const logger = require('../utils/logger');
const eventBroadcaster = require('./realtime/eventBroadcaster');

class DocumentService {
  /**
   * Menyimpan dokumen identitas yang diunggah dan mengatur status ke 'pending'.
   * Berkas lama dihapus HANYA setelah transaksi database berhasil di-commit.
   * Jika AUTO_VERIFY_DOCS=true, simulasikan transisi ke 'verified' setelah 10 detik.
   */
  async handleDocumentsUpload(userId, uploadedDocs = []) {
    const oldFilesToDelete = [];
    let kindsUploaded = [];
    let nextDocs = null;

    await transaction(async (tx) => {
      const user = await tx.userRepo.findById(userId);
      if (!user) {
        throw new AppError('Pengguna tidak ditemukan.', 'NOT_FOUND', 404);
      }

      const currentDocs = user.documents || { ktp: 'not_uploaded', sim: 'not_uploaded' };
      const currentPaths = user.documentPaths || {};

      nextDocs = { ...currentDocs };
      const nextPaths = { ...currentPaths };
      kindsUploaded = [];

      for (const { kind, file } of uploadedDocs) {
        if (['ktp', 'sim'].includes(kind)) {
          const oldFile = currentPaths[kind];
          if (oldFile && oldFile !== file.path) {
            oldFilesToDelete.push(oldFile);
          }

          nextDocs[kind] = 'pending';
          nextPaths[kind] = file.path;
          kindsUploaded.push(kind);

          if (tx.driver === 'postgres' && tx.documentRepo) {
            await tx.documentRepo.upsert({
              userId,
              type: kind,
              filePath: file.path,
              fileName: file.filename,
              sizeBytes: file.size,
              mimeType: file.mimetype,
              status: 'pending',
            });
          }
        }
      }

      await tx.userRepo.update(userId, {
        documents: nextDocs,
        documentPaths: nextPaths,
      });

      // Realtime Outbox Event: Dokumen Diunggah
      await eventBroadcaster.publish(tx, {
        type: 'document.updated',
        entityId: String(userId),
        userId: Number(userId),
        payload: { userId: Number(userId), kinds: kindsUploaded, status: 'pending' },
      });
      await eventBroadcaster.publish(tx, {
        type: 'counters.changed',
        entityId: 'documents',
        userId: null,
        payload: { action: 'document_uploaded' },
      });
    });

    // PENGHAPUSAN FILE FISIK: Dijalankan HANYA setelah COMMIT berhasil
    for (const oldFile of oldFilesToDelete) {
      if (oldFile && fs.existsSync(oldFile)) {
        try {
          fs.unlinkSync(oldFile);
          logger.info(`[DOCS] Berkas lama berhasil dihapus setelah commit: ${oldFile}`);
        } catch (e) {
          logger.warn(`[DOCS] Peringatan: Gagal menghapus file lama ${oldFile}: ${e.message}`);
        }
      }
    }

    // Simulasi verifikasi otomatis setelah 10 detik jika env AUTO_VERIFY_DOCS aktif
    if (env.AUTO_VERIFY_DOCS) {
      setTimeout(async () => {
        try {
          const freshUser = await userRepo.findById(userId);
          if (freshUser && freshUser.documents) {
            const updated = { ...freshUser.documents };
            kindsUploaded.forEach((k) => {
              if (updated[k] === 'pending') {
                updated[k] = 'verified';
              }
            });
            await userRepo.update(userId, { documents: updated });
            logger.info(`[DOCS] Dokumen [${kindsUploaded.join(', ')}] user ${userId} otomatis terverifikasi (10s delay).`);
          }
        } catch (err) {
          logger.error(`[DOCS] Gagal verifikasi otomatis dokumen user ${userId}:`, err);
        }
      }, 10000);
    }

    return nextDocs;
  }

  /**
   * Mengambil file dokumen milik pengguna (hanya pemilik yang diizinkan).
   */
  async getDocumentFile(userId, type, actor = null, reqInfo = null) {
    if (!['ktp', 'sim'].includes(type)) {
      throw new AppError('Jenis dokumen harus "ktp" atau "sim".', 'VALIDATION_ERROR', 400);
    }

    const path = require('path');
    const { verifyImageMagicBytes } = require('../utils/magicBytes');
    const { recordAudit } = require('../middleware/audit');

    let doc = null;
    if (documentRepo) {
      doc = await documentRepo.findByUserIdAndType(userId, type);
    }

    const user = await userRepo.findById(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 'NOT_FOUND', 404);
    }

    const currentStatus = (doc && doc.status) || (user.documents && user.documents[type]) || 'not_uploaded';
    if (currentStatus === 'not_uploaded' || currentStatus === 'none') {
      throw new AppError(`Berkas dokumen ${type.toUpperCase()} belum diunggah.`, 'NOT_FOUND', 404);
    }

    const storedName = (doc && doc.storedName) || (user.documentPaths && path.basename(user.documentPaths[type] || ''));
    const docFilePath = (doc && doc.filePath) || (user.documentPaths && user.documentPaths[type]);

    const candidatePaths = [
      docFilePath,
      storedName ? path.resolve(env.UPLOAD_PATH, 'documents', storedName) : null,
      storedName ? path.resolve(env.UPLOAD_PATH, storedName) : null,
      docFilePath ? path.resolve(process.cwd(), docFilePath) : null,
      storedName ? path.resolve(__dirname, '../../../backend/uploads/documents', storedName) : null,
      storedName ? path.resolve(__dirname, '../../../../uploads/documents', storedName) : null,
      storedName ? path.resolve(__dirname, '../../uploads/documents', storedName) : null,
      storedName ? path.resolve(__dirname, '../../../uploads/documents', storedName) : null,
    ].filter(Boolean);

    const resolvedPath = candidatePaths.find((p) => fs.existsSync(p));

    if (actor) {
      await recordAudit(null, {
        actorId: actor.id,
        actorRole: actor.role || 'customer',
        actorName: actor.name,
        action: 'VIEW_OWN_DOCUMENT',
        entityType: 'Document',
        entityId: `${userId}_${type}`,
        details: `Pelanggan #${userId} (${user.name}) melihat foto dokumen ${type.toUpperCase()} miliknya`,
        ip: reqInfo?.ip,
        userAgent: reqInfo?.userAgent,
      }).catch((e) => logger.warn(`[AUDIT] Gagal mencatat audit akses dokumen: ${e.message}`));
    }

    if (resolvedPath && fs.existsSync(resolvedPath)) {
      const magic = verifyImageMagicBytes(resolvedPath);
      const mimeType = magic.valid ? magic.mime : (doc && doc.mimeType) || 'image/jpeg';
      const safeFilename = `dokumen-${userId}-${type}.${magic.valid ? magic.format : 'jpg'}`;

      return {
        stream: fs.createReadStream(resolvedPath),
        contentType: mimeType,
        filename: safeFilename,
        filePath: resolvedPath,
        status: currentStatus,
        document: doc,
      };
    }

    // Fallback tampilan SVG terenkripsi jika berkas fisik seed/demo belum tersimpan di disk
    const { Readable } = require('stream');
    const label = type === 'ktp' ? 'KTP (KARTU TANDA PENDUDUK)' : 'SIM C (SURAT IZIN MENGEMUDI)';
    const statusColor = currentStatus === 'verified' ? '#4ade80' : currentStatus === 'rejected' ? '#f87171' : '#fbbf24';
    const statusText = currentStatus === 'verified' ? '✓ Terverifikasi' : currentStatus === 'rejected' ? '✕ Ditolak' : '⏳ Menunggu Verifikasi';
    const svgBadge = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
      <rect width="600" height="380" rx="16" fill="#1e293b"/>
      <rect x="20" y="20" width="560" height="340" rx="12" fill="#0f172a" stroke="#334155" stroke-width="2"/>
      <text x="50" y="70" fill="#f8fafc" font-size="20" font-family="sans-serif" font-weight="bold">REPUBLIK INDONESIA</text>
      <text x="50" y="100" fill="#38bdf8" font-size="14" font-family="sans-serif" font-weight="bold">${label}</text>
      <rect x="50" y="130" width="120" height="150" rx="8" fill="#334155"/>
      <circle cx="110" cy="180" r="30" fill="#64748b"/>
      <path d="M70 250 C70 220, 150 220, 150 250 Z" fill="#64748b"/>
      <text x="200" y="150" fill="#94a3b8" font-size="12" font-family="sans-serif">Nama Pemilik</text>
      <text x="200" y="175" fill="#f8fafc" font-size="16" font-family="sans-serif" font-weight="bold">${user.name || `Pengguna #${userId}`}</text>
      <text x="200" y="210" fill="#94a3b8" font-size="12" font-family="sans-serif">Status Dokumen</text>
      <text x="200" y="235" fill="${statusColor}" font-size="14" font-family="sans-serif" font-weight="bold">${statusText}</text>
      <text x="200" y="270" fill="#64748b" font-size="11" font-family="sans-serif">Dokumen Resmi Terdaftar • RodaKita</text>
    </svg>`;

    return {
      stream: Readable.from([svgBadge]),
      contentType: 'image/svg+xml',
      filename: `dokumen-${userId}-${type}.svg`,
      filePath: null,
      status: currentStatus,
      document: doc,
    };
  }

  /**
   * Mengambil daftar dan status dokumen pengguna yang sedang login.
   */
  async getMyDocuments(userId) {
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 'NOT_FOUND', 404);
    }

    let docs = [];
    if (documentRepo) {
      docs = await documentRepo.findByUserId(userId);
    }

    const res = {};
    for (const type of ['ktp', 'sim']) {
      const doc = docs.find((d) => d.type === type);
      const status = (doc && doc.status) || (user.documents && user.documents[type]) || 'not_uploaded';
      res[type] = {
        type,
        status,
        fileName: doc ? doc.storedName : null,
        sizeBytes: doc ? doc.sizeBytes : null,
        uploadedAt: doc ? doc.uploadedAt : null,
        verifiedAt: doc ? doc.verifiedAt : null,
        reviewerNote: doc ? doc.reviewerNote : null,
        fileUrl: status !== 'not_uploaded' ? `/api/auth/documents/${type}` : null,
      };
    }
    return res;
  }
}

module.exports = new DocumentService();
