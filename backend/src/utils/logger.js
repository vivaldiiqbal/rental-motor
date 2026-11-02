const fs = require('fs');
const path = require('path');

const isTest = process.env.NODE_ENV === 'test';
const logDir = path.resolve(__dirname, '../../logs');
const logFile = path.join(logDir, 'app.log');
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Filter keamanan rekursif agar sandi, token, dan berkas biner tidak pernah tercatat di log.
 */
function redactSensitive(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    return data
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/("password"|"currentPassword"|"newPassword"|"passwordHash")\s*:\s*"[^"]+"/gi, '$1:"[REDACTED]"');
  }
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redactSensitive);

  const copy = {};
  for (const [k, v] of Object.entries(data)) {
    if (/password|token|secret|authorization|buffer|fileContent|rawFile/i.test(k)) {
      copy[k] = '[REDACTED]';
    } else {
      copy[k] = redactSensitive(v);
    }
  }
  return copy;
}

/**
 * Menulis log ke file logs/app.log dengan rotasi otomatis jika melebihi 5 MB.
 */
function writeToFile(level, message, meta = []) {
  if (isTest) return;
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Rotasi sederhana jika file melebihi batas ukuran
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size >= MAX_LOG_SIZE_BYTES) {
        const backupFile = path.join(logDir, 'app.log.1');
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(logFile, backupFile);
      }
    }

    const metaStr = meta.length > 0 ? ' ' + JSON.stringify(meta.map(redactSensitive)) : '';
    const logLine = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${redactSensitive(message)}${metaStr}\n`;
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (err) {
    // Jangan biarkan kegagalan logging menjatuhkan aplikasi
  }
}

const logger = {
  info: (msg, ...meta) => {
    writeToFile('INFO', msg, meta);
    if (!isTest) {
      console.log(`[INFO] [${new Date().toISOString()}] ${redactSensitive(msg)}`, ...meta.map(redactSensitive));
    }
  },
  warn: (msg, ...meta) => {
    writeToFile('WARN', msg, meta);
    if (!isTest) {
      console.warn(`[WARN] [${new Date().toISOString()}] ${redactSensitive(msg)}`, ...meta.map(redactSensitive));
    }
  },
  error: (msg, ...meta) => {
    writeToFile('ERROR', msg, meta);
    if (!isTest) {
      console.error(`[ERROR] [${new Date().toISOString()}] ${redactSensitive(msg)}`, ...meta.map(redactSensitive));
    }
  },
  debug: (msg, ...meta) => {
    writeToFile('DEBUG', msg, meta);
    if (!isTest && process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] [${new Date().toISOString()}] ${redactSensitive(msg)}`, ...meta.map(redactSensitive));
    }
  },
};

module.exports = logger;
