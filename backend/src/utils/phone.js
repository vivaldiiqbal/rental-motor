/**
 * Validasi dan normalisasi nomor telepon Indonesia.
 * Format valid: 08xx atau +62xx atau 62xx (9-14 digit).
 * Normalisasi selalu ke format internasional +62...
 */

function isValidIndonesianPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.trim().replace(/[-\s]/g, '');
  return /^(08|\+628|628)[0-9]{7,12}$/.test(cleaned);
}

function normalizeIndonesianPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.trim().replace(/[-\s]/g, '');

  if (cleaned.startsWith('08')) {
    cleaned = '+62' + cleaned.slice(1);
  } else if (cleaned.startsWith('628')) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

module.exports = {
  isValidIndonesianPhone,
  normalizeIndonesianPhone,
};
