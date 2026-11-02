const { auditRepo: defaultAuditRepo } = require('../repositories');

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'refreshToken',
  'secret',
  'jwt',
  'authorization',
  'fileBuffer',
  'buffer',
]);

/**
 * Filter data rekaman audit agar tidak pernah menyimpan data sensitif.
 */
function sanitizeAuditData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeAuditData);
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key)) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeAuditData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Catat aktivitas forensik ke repositori audit_logs.
 * Wajib dijalankan di dalam unit kerja / transaksi yang sama dengan perubahan data.
 */
async function recordAudit(firstArg, ...rest) {
  let targetRepo = defaultAuditRepo;
  let payload = {};

  if (firstArg && typeof firstArg.create === 'function') {
    targetRepo = firstArg;
    if (typeof rest[1] === 'string') {
      const [reqContext, action, entityType, entityId, before, after] = rest;
      const actor = reqContext?.user || {};
      payload = {
        actorId: actor.id || null,
        actorRole: actor.role || 'system',
        actorName: actor.name || 'Petugas',
        action,
        entityType,
        entityId,
        before,
        after,
        ip: reqContext?.ip || '127.0.0.1',
        userAgent: reqContext?.headers ? reqContext.headers['user-agent'] : 'Unknown Agent',
        details: `${action} pada ${entityType} #${entityId}`,
      };
    } else {
      payload = rest[0] || {};
    }
  } else if (typeof rest[0] === 'string') {
    const reqContext = firstArg || {};
    targetRepo = reqContext.tx?.auditRepo || reqContext.auditRepo || defaultAuditRepo;
    const [action, entityType, entityId, before, after] = rest;
    const actor = reqContext.user || {};
    payload = {
      actorId: actor.id || null,
      actorRole: actor.role || 'system',
      actorName: actor.name || 'Petugas',
      action,
      entityType,
      entityId,
      before,
      after,
      ip: reqContext.ip || '127.0.0.1',
      userAgent: reqContext.headers ? reqContext.headers['user-agent'] : 'Unknown Agent',
      details: `${action} pada ${entityType} #${entityId}`,
    };
  } else if (typeof firstArg === 'object' && firstArg !== null) {
    payload = firstArg;
  }

  const entry = {
    actorId: payload.actorId || null,
    actorRole: payload.actorRole || 'system',
    actorName: payload.actorName || 'Petugas',
    action: payload.action || 'UNKNOWN_ACTION',
    entityType: payload.entityType || 'General',
    entityId: payload.entityId !== undefined ? String(payload.entityId) : null,
    details: payload.details || '',
    before: sanitizeAuditData(payload.before) || null,
    after: sanitizeAuditData(payload.after) || null,
    ip: payload.ip || '127.0.0.1',
    userAgent: payload.userAgent || 'Unknown Agent',
    at: new Date().toISOString(),
  };

  return await targetRepo.create(entry);
}

module.exports = {
  recordAudit,
  sanitizeAuditData,
};
