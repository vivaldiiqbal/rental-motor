const crypto = require('crypto');
const env = require('../config/env');

const VALID_EMERGENCY_RELATIONS = ['orang tua', 'pasangan', 'saudara', 'kerabat', 'teman'];

/**
 * Normalisasi nomor telepon ke format E.164 (+62...)
 * @param {string} phone
 * @returns {string|null}
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[\s\-_()]/g, '').trim();

  let formatted = cleaned;
  if (formatted.startsWith('0')) {
    formatted = '+62' + formatted.slice(1);
  } else if (formatted.startsWith('62')) {
    formatted = '+' + formatted;
  } else if (!formatted.startsWith('+')) {
    formatted = '+62' + formatted;
  }

  // Nomor seluler Indonesia baku: +628 diikuti 8-12 digit
  const idPhoneRegex = /^\+628[1-9][0-9]{7,11}$/;
  if (!idPhoneRegex.test(formatted)) {
    return null;
  }
  return formatted;
}

/**
 * Validasi dan hash NIK dengan HMAC-SHA256 (rahasia server)
 * @param {string} nik
 * @returns {{ hash: string, last4: string } | null}
 */
function hashNik(nik) {
  if (!nik || typeof nik !== 'string') return null;
  const cleaned = nik.trim();
  if (!/^\d{16}$/.test(cleaned)) {
    return null;
  }

  const secret = env.NIK_HMAC_SECRET || 'rodakita_nik_secret_hmac_2026_change_in_production';
  const hash = crypto.createHmac('sha256', secret).update(cleaned).digest('hex');
  const last4 = cleaned.slice(-4);
  return { hash, last4 };
}

/**
 * Validasi nama lengkap sesuai KTP:
 * Minimal 2 kata, tanpa angka dan simbol aneh (hanya huruf, spasi, titik, apostrof)
 * @param {string} name
 * @returns {boolean}
 */
function validateFullName(name) {
  if (!name || typeof name !== 'string') return false;
  const cleaned = name.trim();
  // Karakter yang diizinkan: huruf Latin, spasi, titik (singkatan), apostrof, tanda hubung (-)
  if (!/^[a-zA-Z\s'.-]+$/.test(cleaned)) return false;

  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 2) return false;

  // Menolak teks karangan acak berulang atau karakter berturut-turut aneh
  for (const word of words) {
    if (word.length < 2 && !word.endsWith('.')) return false;
    // Cek huruf berulang lebih dari 4 kali (misal: "vvvvvaldi")
    if (/(.)\1{4,}/i.test(word)) return false;
  }

  return true;
}

/**
 * Hitung usia dan validasi terhadap batas minimum usia sewa
 * @param {string} birthDateStr - format YYYY-MM-DD
 * @param {number} minAge - usia minimal dari pengaturan (default 18)
 * @returns {{ isValid: boolean, age: number }}
 */
function validateBirthDate(birthDateStr, minAge = 18) {
  if (!birthDateStr || typeof birthDateStr !== 'string') {
    return { isValid: false, age: 0 };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) {
    return { isValid: false, age: 0 };
  }

  const birthDate = new Date(birthDateStr + 'T00:00:00Z');
  if (isNaN(birthDate.getTime())) {
    return { isValid: false, age: 0 };
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }

  return {
    isValid: age >= minAge && age <= 100,
    age,
  };
}

/**
 * Validasi komprehensif payload profil penyewa
 * @param {Object} input
 * @param {Object} options - { minAge: 18 }
 * @returns {{ isValid: boolean, errors: Object, normalized: Object }}
 */
function validateRenterProfileInput(input = {}, options = {}) {
  const minAge = options.minAge || 18;
  const errors = {};
  const normalized = {};

  // 1. Nama Lengkap KTP
  const rawName = input.fullNameKtp || input.full_name_ktp || input.name || '';
  if (!validateFullName(rawName)) {
    errors.fullNameKtp = 'Nama lengkap minimal dua kata dan hanya boleh berisi huruf, tanda petik, atau titik tanpa angka/simbol.';
  } else {
    normalized.fullNameKtp = rawName.trim().replace(/\s+/g, ' ');
  }

  // 2. Tanggal Lahir & Usia
  const rawDob = input.birthDate || input.birth_date || '';
  const dobCheck = validateBirthDate(rawDob, minAge);
  if (!dobCheck.isValid) {
    errors.birthDate = `Tanggal lahir tidak valid. Usia penyewa minimal ${minAge} tahun.`;
  } else {
    normalized.birthDate = rawDob;
    normalized.age = dobCheck.age;
  }

  // 3. Nomor KTP (NIK)
  const rawNik = input.nik || input.nikNumber || input.idNumber || '';
  if (rawNik) {
    const nikCheck = hashNik(rawNik);
    if (!nikCheck) {
      errors.nik = 'Nomor KTP (NIK) harus terdiri dari tepat 16 digit angka.';
    } else {
      normalized.nikHash = nikCheck.hash;
      normalized.nikLast4 = nikCheck.last4;
    }
  } else if (!input.nikHash) {
    errors.nik = 'Nomor KTP (NIK) 16 digit wajib diisi.';
  } else {
    normalized.nikHash = input.nikHash;
    normalized.nikLast4 = input.nikLast4 || '0000';
  }

  // 4. Nomor Telepon Penyewa
  const rawPhone = input.phone || input.phoneE164 || input.phone_e164 || '';
  const normPhone = normalizePhone(rawPhone);
  if (!normPhone) {
    errors.phone = 'Nomor HP/WhatsApp penyewa tidak valid (harus nomor Indonesia aktif, misal 08123456789).';
  } else {
    normalized.phoneE164 = normPhone;
  }

  // 5. Alamat KTP
  const rawAddressKtp = input.addressKtp || input.address_ktp || input.address || '';
  if (!rawAddressKtp || rawAddressKtp.trim().length < 8) {
    errors.addressKtp = 'Alamat sesuai KTP wajib diisi lengkap minimal 8 karakter.';
  } else {
    normalized.addressKtp = rawAddressKtp.trim();
  }

  // 6. Alamat Tinggal / Penginapan selama Sewa
  const rawStayAddress = input.stayAddress || input.stay_address || '';
  if (!rawStayAddress || rawStayAddress.trim().length < 5) {
    errors.stayAddress = 'Alamat tinggal/penginapan selama masa sewa wajib diisi lengkap.';
  } else {
    normalized.stayAddress = rawStayAddress.trim();
  }

  // 7. Kontak Darurat
  const rawEmName = input.emergencyName || input.emergency_name || input.emergencyContact?.name || '';
  if (!rawEmName || rawEmName.trim().length < 2) {
    errors.emergencyName = 'Nama kontak darurat wajib diisi.';
  } else {
    normalized.emergencyName = rawEmName.trim();
  }

  const rawEmRelation = (input.emergencyRelation || input.emergency_relation || input.emergencyContact?.relation || '').toLowerCase().trim();
  if (!VALID_EMERGENCY_RELATIONS.includes(rawEmRelation)) {
    errors.emergencyRelation = `Hubungan kontak darurat harus salah satu dari: ${VALID_EMERGENCY_RELATIONS.join(', ')}.`;
  } else {
    normalized.emergencyRelation = rawEmRelation;
  }

  const rawEmPhone = input.emergencyPhone || input.emergency_phone || input.emergencyContact?.phone || '';
  const normEmPhone = normalizePhone(rawEmPhone);
  if (!normEmPhone) {
    errors.emergencyPhone = 'Nomor telepon kontak darurat tidak valid.';
  } else {
    normalized.emergencyPhone = normEmPhone;
  }

  if (normalized.phoneE164 && normalized.emergencyPhone && normalized.phoneE164 === normalized.emergencyPhone) {
    errors.emergencyPhone = 'Nomor kontak darurat tidak boleh sama dengan nomor telepon penyewa.';
  }

  // 8. Persetujuan Syarat & Privasi serta GPS
  normalized.termsVersionAccepted = Number.isInteger(input.termsVersionAccepted || input.terms_version_accepted)
    ? Number(input.termsVersionAccepted || input.terms_version_accepted)
    : 1;

  normalized.privacyVersionAccepted = Number.isInteger(input.privacyVersionAccepted || input.privacy_version_accepted)
    ? Number(input.privacyVersionAccepted || input.privacy_version_accepted)
    : 1;

  if (input.agreeGpsConsent !== false && input.gps_consent_at !== null) {
    normalized.gpsConsentAt = input.gpsConsentAt || input.gps_consent_at || new Date().toISOString();
  } else {
    errors.gpsConsent = 'Persetujuan pelacak GPS selama masa sewa wajib disetujui.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  VALID_EMERGENCY_RELATIONS,
  normalizePhone,
  hashNik,
  validateFullName,
  validateBirthDate,
  validateRenterProfileInput,
};
