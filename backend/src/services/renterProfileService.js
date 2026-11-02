const {
  userRepo,
  renterProfileRepo,
  documentRepo,
  auditRepo,
  settingsRepo,
  transaction,
} = require('../repositories');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const {
  validateRenterProfileInput,
  hashNik,
  normalizePhone,
} = require('../utils/renterValidation');

class RenterProfileService {
  /**
   * Evaluasi kesiapan profil penyewa (SATU fungsi tunggal renterReadiness).
   * Menghitung status dan daftar kekurangan dalam Bahasa Indonesia.
   *
   * @param {number|string} userId
   * @param {Object} [client] - Postgres client opsional (jika dalam transaksi)
   * @returns {Promise<{
   *   isReady: boolean,
   *   status: 'complete' | 'incomplete' | 'pending_verification' | 'rejected',
   *   missingFields: string[],
   *   pendingDocuments: string[],
   *   issues: string[],
   *   profile: Object|null,
   *   documents: Object,
   *   actionUrl: string
   * }>}
   */
  async renterReadiness(userId, client = null) {
    const numericUserId = Number(userId);
    const user = await userRepo.findById(numericUserId, client);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 'USER_NOT_FOUND', 404);
    }

    const profile = await renterProfileRepo.findByUserId(numericUserId, client);
    const docs = user.documents || { ktp: 'not_uploaded', sim: 'not_uploaded', selfie: 'not_uploaded' };

    const missingFields = [];
    const issues = [];
    const pendingDocuments = [];

    // 1. Periksa kelengkapan isian formulir profil
    if (!profile) {
      missingFields.push('Profil penyewa belum dibuat');
      issues.push('Profil identitas dan kontak darurat belum diisi.');
    } else {
      if (!profile.fullNameKtp) {
        missingFields.push('Nama lengkap sesuai KTP');
        issues.push('Nama lengkap sesuai KTP belum diisi.');
      }
      if (!profile.birthDate) {
        missingFields.push('Tanggal lahir');
        issues.push('Tanggal lahir belum diisi.');
      }
      if (!profile.nikHash) {
        missingFields.push('Nomor KTP (NIK)');
        issues.push('Nomor KTP (NIK 16 digit) belum diisi.');
      }
      if (!profile.addressKtp) {
        missingFields.push('Alamat KTP');
        issues.push('Alamat sesuai KTP belum diisi.');
      }
      if (!profile.phoneE164) {
        missingFields.push('Nomor telepon terverifikasi');
        issues.push('Nomor telepon terverifikasi belum diisi.');
      }
      if (!profile.stayAddress) {
        missingFields.push('Alamat tinggal/penginapan selama sewa');
        issues.push('Alamat tinggal/penginapan selama masa sewa belum diisi.');
      }
      if (!profile.emergencyName || !profile.emergencyRelation || !profile.emergencyPhone) {
        missingFields.push('Kontak darurat lengkap');
        issues.push('Kontak darurat (nama, relasi, dan nomor telepon) belum lengkap.');
      }
      if (!profile.gpsConsentAt) {
        missingFields.push('Persetujuan pelacak GPS');
        issues.push('Persetujuan pelacak GPS selama masa sewa belum disetujui.');
      }
    }

    // 2. Periksa status verifikasi dokumen (KTP, SIM C, selfie)
    const ktpStatus = docs.ktp || 'not_uploaded';
    const simStatus = docs.sim || 'not_uploaded';
    const selfieStatus = docs.selfie || 'not_uploaded';

    const formatDocStatus = (kind, st) => {
      switch (st) {
        case 'verified':
          return null;
        case 'pending':
          return `${kind} (menunggu verifikasi staf)`;
        case 'rejected':
          return `${kind} (ditolak)`;
        default:
          return `${kind} (belum diunggah)`;
      }
    };

    const ktpIssue = formatDocStatus('KTP', ktpStatus);
    const simIssue = formatDocStatus('SIM C', simStatus);
    const selfieIssue = (docs.selfie && docs.selfie !== 'verified')
      ? formatDocStatus('Foto Selfie', selfieStatus)
      : (env.REQUIRE_SELFIE_VERIFICATION ? formatDocStatus('Foto Selfie', selfieStatus) : null);

    if (ktpIssue) {
      pendingDocuments.push(ktpIssue);
      issues.push(`Dokumen ${ktpIssue}.`);
    }
    if (simIssue) {
      pendingDocuments.push(simIssue);
      issues.push(`Dokumen ${simIssue}.`);
    }
    if (selfieIssue) {
      pendingDocuments.push(selfieIssue);
      issues.push(`Dokumen ${selfieIssue}.`);
    }

    // 3. Tentukan status agregat kesiapan
    let status = 'complete';
    if (missingFields.length > 0) {
      status = 'incomplete';
    } else if (ktpStatus === 'rejected' || simStatus === 'rejected' || selfieStatus === 'rejected') {
      status = 'rejected';
    } else if (ktpStatus !== 'verified' || simStatus !== 'verified' || (selfieIssue && selfieStatus !== 'verified')) {
      status = 'pending_verification';
    }

    const isReady = status === 'complete';
    const actionUrl = missingFields.length > 0 ? '/profile#renter-data' : '/profile#documents';

    // Masking NIK: hanya 4 digit terakhir yang ditampilkan ke UI
    const sanitizedProfile = profile
      ? {
          ...profile,
          nikMasked: profile.nikLast4 ? `••••••••••••${profile.nikLast4}` : 'Belum diisi',
        }
      : null;

    return {
      isReady,
      status,
      missingFields,
      pendingDocuments,
      issues,
      profile: sanitizedProfile,
      documents: docs,
      actionUrl,
    };
  }

  /**
   * Mengambil data profil penyewa milik user saat ini (dengan masking NIK)
   */
  async getProfile(userId) {
    const readiness = await this.renterReadiness(userId);
    return {
      profile: readiness.profile,
      readiness,
    };
  }

  /**
   * Memperbarui profil penyewa dengan validasi ketat dan deteksi perubahan identitas kunci.
   */
  async updateProfile(userId, input, reqContext = {}) {
    const numericUserId = Number(userId);

    let settings = null;
    try {
      settings = await settingsRepo.getSettings();
    } catch {
      // fallback
    }
    const minAge = settings?.minRenterAge || 18;

    // 1. Validasi input formulir
    const { isValid, errors, normalized } = validateRenterProfileInput(input, { minAge });
    if (!isValid) {
      const firstMsg = Object.values(errors)[0];
      throw new AppError(firstMsg, 'VALIDATION_ERROR', 400, { errors });
    }

    return await transaction(async (tx) => {
      // 2. Cek keunikan NIK hash: tidak boleh dipakai oleh akun lain
      if (normalized.nikHash) {
        const existingWithNik = await tx.renterProfileRepo.findByNikHash(normalized.nikHash);
        if (existingWithNik && Number(existingWithNik.userId) !== numericUserId) {
          throw new AppError('Nomor NIK ini telah terdaftar pada akun lain.', 'NIK_ALREADY_REGISTERED', 409);
        }
      }

      // 3. Ambil data profil lama & status dokumen
      const existingProfile = await tx.renterProfileRepo.findByUserId(numericUserId);
      const user = await tx.userRepo.findById(numericUserId);
      const docs = user?.documents || { ktp: 'not_uploaded', sim: 'not_uploaded', selfie: 'not_uploaded' };

      // 4. Deteksi apakah identitas kunci berubah setelah verifikasi
      let resetDocsToPending = false;
      const changedFields = [];

      if (existingProfile) {
        const isNameChanged = normalized.fullNameKtp && normalized.fullNameKtp !== existingProfile.fullNameKtp;
        const isNikChanged = normalized.nikHash && normalized.nikHash !== existingProfile.nikHash;
        const isDobChanged = normalized.birthDate && normalized.birthDate !== existingProfile.birthDate;

        if (isNameChanged) changedFields.push('Nama Lengkap KTP');
        if (isNikChanged) changedFields.push('Nomor KTP (NIK)');
        if (isDobChanged) changedFields.push('Tanggal Lahir');

        const hadVerifiedDocs = docs.ktp === 'verified' || docs.sim === 'verified';
        if (changedFields.length > 0 && hadVerifiedDocs) {
          resetDocsToPending = true;
        }
      }

      let nextDocs = { ...docs };
      if (resetDocsToPending) {
        if (nextDocs.ktp === 'verified') nextDocs.ktp = 'pending';
        if (nextDocs.sim === 'verified') nextDocs.sim = 'pending';
        if (nextDocs.selfie === 'verified') nextDocs.selfie = 'pending';

        if (tx.driver === 'postgres' && tx.documentRepo) {
          if (docs.ktp === 'verified') await tx.documentRepo.updateStatus(numericUserId, 'ktp', 'pending', 'Reset otomatis karena perubahan data identitas');
          if (docs.sim === 'verified') await tx.documentRepo.updateStatus(numericUserId, 'sim', 'pending', 'Reset otomatis karena perubahan data identitas');
        }

        // Catat di audit log
        if (tx.auditRepo) {
          await tx.auditRepo.create({
            actorId: numericUserId,
            actorRole: 'customer',
            action: 'DOCUMENT_STATUS_RESET',
            entityType: 'renter_profile',
            entityId: numericUserId,
            after: {
              reason: 'Perubahan identitas kunci (nama/NIK/tanggal lahir) mengembalikan status dokumen ke menunggu verifikasi.',
              changedFields,
            },
            ip: reqContext.ip || null,
            userAgent: reqContext.userAgent || null,
          });
        }
      }

      // Tentukan completedAt jika dokumen sudah verified dan semua data lengkap
      const isDocsFullyVerified = nextDocs.ktp === 'verified' && nextDocs.sim === 'verified';
      const completedAt = isDocsFullyVerified && !resetDocsToPending
        ? (existingProfile?.completedAt || new Date().toISOString())
        : null;

      // 5. Simpan profil penyewa
      const saved = await tx.renterProfileRepo.upsert(numericUserId, {
        fullNameKtp: normalized.fullNameKtp,
        birthDate: normalized.birthDate,
        nikHash: normalized.nikHash,
        nikLast4: normalized.nikLast4,
        addressKtp: normalized.addressKtp,
        phoneE164: normalized.phoneE164,
        stayAddress: normalized.stayAddress,
        emergencyName: normalized.emergencyName,
        emergencyRelation: normalized.emergencyRelation,
        emergencyPhone: normalized.emergencyPhone,
        termsVersionAccepted: normalized.termsVersionAccepted,
        privacyVersionAccepted: normalized.privacyVersionAccepted,
        gpsConsentAt: normalized.gpsConsentAt,
        completedAt,
      });

      // 6. Sinkronisasi nama dan nomor telepon akun users
      await tx.userRepo.update(numericUserId, {
        name: normalized.fullNameKtp,
        phone: normalized.phoneE164,
        address: normalized.addressKtp,
        documents: nextDocs,
      });

      const readiness = await this.renterReadiness(numericUserId, tx.client);
      return {
        profile: saved,
        readiness,
        resetDocsToPending,
      };
    });
  }
}

const renterProfileService = new RenterProfileService();
module.exports = renterProfileService;
