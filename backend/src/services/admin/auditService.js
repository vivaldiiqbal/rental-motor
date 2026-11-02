const { auditRepo } = require('../../repositories');

const auditService = {
  async getAuditLogs(query = {}) {
    const { search, action, actorName, date, page = 1, limit = 20 } = query;

    const filter = {};
    if (action) filter.action = action;
    if (search) filter.search = search;
    if (actorName) filter.actorName = actorName;
    if (date) filter.date = date;

    const result = await auditRepo.findAll(filter, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });

    return {
      items: result.items.map((log) => ({
        id: log.id,
        action: log.action,
        module: log.entityType || 'General',
        details: log.details || `${log.action} pada ${log.entityType} #${log.entityId}`,
        actorName: log.actorName || (log.actor && log.actor.name) || 'Sistem',
        actorRole: log.actorRole || 'admin',
        targetId: log.entityId,
        timestamp: log.at || log.timestamp || log.createdAt,
        ip: log.ip,
        before: log.before,
        after: log.after,
      })),
      total: result.total,
    };
  },
};

module.exports = auditService;
