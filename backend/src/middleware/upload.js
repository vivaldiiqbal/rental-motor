const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const { verifyImageMagicBytes } = require('../utils/magicBytes');

const DOCUMENTS_DIR = path.join(env.UPLOAD_PATH, 'documents');
if (!fs.existsSync(DOCUMENTS_DIR)) {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

// Konfigurasi storage disk dengan nama file acak (UUID)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOCUMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = `${uuidv4()}${ext}`;
    cb(null, randomName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];

  if (ext === '.pdf' || file.mimetype === 'application/pdf') {
    return cb(
      new AppError(
        'File berformat PDF ditolak. Harap unggah foto identitas asli (JPG, PNG, atau WEBP).',
        'UNSUPPORTED_FILE_TYPE',
        415,
      ),
      false,
    );
  }

  if (!allowed.includes(ext) || !file.mimetype.startsWith('image/')) {
    return cb(
      new AppError(
        'Format berkas tidak didukung. Harap unggah foto berformat JPG, PNG, atau WEBP.',
        'UNSUPPORTED_FILE_TYPE',
        415,
      ),
      false,
    );
  }

  cb(null, true);
};

const uploadMulter = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024, // Maksimal 2 MB per berkas
  },
  fileFilter,
});

/**
 * Middleware upload dokumen identitas (ktp, sim) dengan verifikasi magic bytes.
 */
function uploadDocumentsMiddleware() {
  const upload = uploadMulter.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'sim', maxCount: 1 },
    { name: 'file', maxCount: 1 }, // Fallback untuk request satu file
  ]);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(
              `Ukuran file melebihi batas maksimal ${env.MAX_FILE_SIZE_MB} MB.`,
              'FILE_TOO_LARGE',
              413,
            ),
          );
        }
        return next(new AppError(`Gagal mengunggah berkas: ${err.message}`, 'VALIDATION_ERROR', 400));
      } else if (err) {
        return next(err);
      }

      // Ambil file yang terunggah
      const files = req.files || {};
      const uploadedFiles = [];

      if (files.ktp && files.ktp[0]) uploadedFiles.push({ kind: 'ktp', file: files.ktp[0] });
      if (files.sim && files.sim[0]) uploadedFiles.push({ kind: 'sim', file: files.sim[0] });
      if (files.file && files.file[0]) {
        const kind = req.body.kind || req.params.kind || 'ktp';
        uploadedFiles.push({ kind, file: files.file[0] });
      }

      if (uploadedFiles.length === 0) {
        return next(
          new AppError('Harap lampirkan foto dokumen identitas (ktp atau sim).', 'VALIDATION_ERROR', 400),
        );
      }

      // Verifikasi Magic Bytes pada setiap berkas yang diunggah
      for (const item of uploadedFiles) {
        const magic = verifyImageMagicBytes(item.file.path);
        if (!magic.valid) {
          // Hapus berkas yang tidak lolos verifikasi
          try {
            fs.unlinkSync(item.file.path);
          } catch {
            /* ignore */
          }
          return next(
            new AppError(
              'Berkas rusak atau bukan format gambar valid (JPG, PNG, atau WEBP).',
              'UNSUPPORTED_FILE_TYPE',
              415,
            ),
          );
        }
      }

      req.uploadedDocs = uploadedFiles;
      next();
    });
  };
}

const MOTORS_DIR = path.join(env.UPLOAD_PATH, 'motors');
if (!fs.existsSync(MOTORS_DIR)) {
  fs.mkdirSync(MOTORS_DIR, { recursive: true });
}

const motorStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MOTORS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = `motor-${uuidv4()}${ext}`;
    cb(null, randomName);
  },
});

const motorUploadMulter = multer({
  storage: motorStorage,
  limits: {
    fileSize: 3 * 1024 * 1024, // Maksimal 3 MB per berkas foto motor
  },
  fileFilter,
});

/**
 * Middleware upload foto motor (maksimal 8 foto per motor, verifikasi magic bytes).
 */
function uploadMotorImagesMiddleware() {
  const upload = motorUploadMulter.fields([
    { name: 'images', maxCount: 8 },
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(
              'Ukuran foto motor melebihi batas maksimal 3 MB.',
              'FILE_TOO_LARGE',
              413,
            ),
          );
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
          return next(
            new AppError(
              'Jumlah foto motor melebihi batas maksimal 8 gambar.',
              'VALIDATION_ERROR',
              400,
            ),
          );
        }
        return next(new AppError(`Gagal mengunggah foto: ${err.message}`, 'VALIDATION_ERROR', 400));
      } else if (err) {
        return next(err);
      }

      const files = req.files || {};
      const uploaded = [];
      if (Array.isArray(files.images)) uploaded.push(...files.images);
      if (Array.isArray(files.image)) uploaded.push(...files.image);
      if (Array.isArray(files.file)) uploaded.push(...files.file);

      // Verifikasi Magic Bytes
      for (const item of uploaded) {
        const magic = verifyImageMagicBytes(item.path);
        if (!magic.valid) {
          // Hapus semua file yang baru diunggah jika ada yang korup/palsu
          uploaded.forEach((f) => {
            try {
              fs.unlinkSync(f.path);
            } catch {
              /* ignore */
            }
          });
          return next(
            new AppError(
              'Berkas rusak atau bukan format gambar valid (JPG, PNG, atau WEBP).',
              'UNSUPPORTED_FILE_TYPE',
              415,
            ),
          );
        }
      }

      req.uploadedMotorImages = uploaded.map((f) => ({
        filename: f.filename,
        path: f.path,
        url: `/uploads/motors/${f.filename}`,
      }));

      next();
    });
  };
}

module.exports = {
  uploadDocumentsMiddleware,
  uploadMotorImagesMiddleware,
};
