const { format } = require('date-fns');

// 32 karakter alfanumerik tanpa karakter ambigu (0, O, 1, I)
const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Menghasilkan string acak sepanjang n karakter tanpa ambigu (0, O, 1, I).
 */
function generateRandomSafeCode(length = 4) {
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * SAFE_ALPHABET.length);
    result += SAFE_ALPHABET.charAt(randomIndex);
  }
  return result;
}

/**
 * Generator kode booking unik RodaKita dengan format RM-YYMMDD-XXXX.
 * Contoh: RM-261021-9K8T
 */
function generateBookingCode(date = new Date()) {
  const yymmdd = format(date, 'yyMMdd');
  const randomPart = generateRandomSafeCode(4);
  return `RM-${yymmdd}-${randomPart}`;
}

module.exports = {
  generateBookingCode,
  generateRandomSafeCode,
  SAFE_ALPHABET,
};
