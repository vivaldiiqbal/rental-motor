const crypto = require('crypto');

/**
 * Base Provider Interface untuk Ingest Posisi GPS
 */
class BaseGpsProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Memverifikasi autentikasi/signature dari vendor GPS.
   * Mendukung HMAC SHA-256 dengan perlindungan anti-replay via timestamp (maks selisih 5 menit).
   * @param {string|Buffer|object} rawBody
   * @param {object} headers
   * @param {string} secret
   * @returns {boolean}
   */
  verifySignature(rawBody, headers = {}, secret = '') {
    if (!secret) return true; // jika tidak ada secret yang dikonfigurasi di env

    // 1. Perlindungan Anti-Replay: Periksa Stempel Waktu (Timestamp Drift > 5 Menit Ditolak)
    const timestampHeader = headers['x-timestamp'] || headers['x-gps-timestamp'];
    if (timestampHeader) {
      const ts = Number(timestampHeader) > 10000000000 ? Number(timestampHeader) : (Number(timestampHeader) * 1000 || new Date(timestampHeader).getTime());
      if (!isNaN(ts)) {
        const diffMs = Math.abs(Date.now() - ts);
        if (diffMs > 5 * 60 * 1000) {
          return false; // Replay attack prevented (selisih > 5 menit)
        }
      }
    }

    // 2. Cek Shared Secret header langsung (x-gps-secret atau x-api-key)
    const directSecret = headers['x-gps-secret'] || headers['x-api-key'];
    if (directSecret && directSecret === secret) {
      return true;
    }

    // 3. Cek HMAC SHA-256 Signature
    const signatureHeader = headers['x-gps-signature'] || headers['x-hub-signature-256'] || headers['x-signature'];
    if (signatureHeader) {
      try {
        const payloadStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
        const cleanSignature = signatureHeader.replace(/^sha256=/i, '').trim();
        const actualBuf = Buffer.from(cleanSignature, 'hex');

        // Skenario A: HMAC dihitung dari `${timestamp}.${payload}`
        if (timestampHeader) {
          const expectedSigA = crypto.createHmac('sha256', secret).update(`${timestampHeader}.${payloadStr}`).digest('hex');
          const expectedBufA = Buffer.from(expectedSigA, 'hex');
          if (expectedBufA.length === actualBuf.length && crypto.timingSafeEqual(expectedBufA, actualBuf)) {
            return true;
          }
        }

        // Skenario B: HMAC dihitung dari raw payloadStr langsung
        const expectedSigB = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
        const expectedBufB = Buffer.from(expectedSigB, 'hex');
        if (expectedBufB.length === actualBuf.length && crypto.timingSafeEqual(expectedBufB, actualBuf)) {
          return true;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Mengurai payload mentah menjadi format posisi GPS terstandar.
   */
  parsePayload(body, headers) {
    throw new Error(`parsePayload must be implemented by ${this.constructor.name}`);
  }
}

module.exports = BaseGpsProvider;
