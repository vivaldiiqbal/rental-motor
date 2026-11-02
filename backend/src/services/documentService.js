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
        }
      }

      await tx.userRepo.update(userId, {
        documents: nextDocs,
        documentPaths: nextPaths,
      });

      for (const { kind, file } of uploadedDocs) {
        if (['ktp', 'sim'].includes(kind) && tx.documentRepo) {
          await tx.documentRepo.upsert({
            userId,
            type: kind,
            filePath: file.path,
            fileName: file.filename,
            storedName: file.filename,
            sizeBytes: file.size,
            mimeType: file.mimetype,
            status: 'pending',
          });
        }
      }

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

    throw new AppError(`Berkas dokumen ${type.toUpperCase()} belum diunggah atau tidak ditemukan di disk.`, 'NOT_FOUND', 404);
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
      const uploadedAt = doc ? doc.uploadedAt : null;
      const ts = uploadedAt ? new Date(uploadedAt).getTime() : null;
      res[type] = {
        type,
        status,
        fileName: doc ? doc.storedName : null,
        storedName: doc ? doc.storedName : null,
        filePath: doc ? doc.filePath : null,
        file_path: doc ? doc.filePath : null,
        sizeBytes: doc ? doc.sizeBytes : null,
        uploadedAt,
        updatedAt: uploadedAt,
        uploaded_at: uploadedAt,
        updated_at: uploadedAt,
        verifiedAt: doc ? doc.verifiedAt : null,
        reviewerNote: doc ? doc.reviewerNote : null,
        fileUrl: status !== 'not_uploaded' ? `/api/auth/documents/${type}${ts ? `?t=${ts}` : ''}` : null,
      };
    }
    return res;
  }
}

module.exports = new DocumentService();
