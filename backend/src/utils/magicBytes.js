const fs = require('fs');

/**
 * Verifikasi magic bytes file gambar (JPEG, PNG, WEBP).
 * Mencegah manipulasi ekstensi palsu (misalnya file script atau PDF yang dinamai .jpg).
 */
function verifyImageMagicBytes(filePathOrBuffer) {
  let buffer;

  if (Buffer.isBuffer(filePathOrBuffer)) {
    buffer = filePathOrBuffer;
  } else if (typeof filePathOrBuffer === 'string') {
    try {
      const fd = fs.openSync(filePathOrBuffer, 'r');
      buffer = Buffer.alloc(16);
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);
    } catch {
      return { valid: false, format: null };
    }
  } else {
    return { valid: false, format: null };
  }

  if (buffer.length < 12) {
    return { valid: false, format: null };
  }

  // 1. JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'jpg', mime: 'image/jpeg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: 'png', mime: 'image/png' };
  }

  // 3. WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, format: 'webp', mime: 'image/webp' };
  }

  return { valid: false, format: null };
}

module.exports = {
  verifyImageMagicBytes,
};
