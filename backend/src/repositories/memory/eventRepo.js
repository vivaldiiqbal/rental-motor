const store = require('../store');

let globalEventSequence = 1000;

const eventRepo = {
  async recordEvent(eventData) {
    return store.withLock(async (data) => {
      if (!data.events) data.events = [];
      const id = ++globalEventSequence;
      const rec = {
        id,
        type: eventData.type,
        entityId: eventData.entityId ? String(eventData.entityId) : null,
        userId: eventData.userId ? Number(eventData.userId) : null,
        version: Number(eventData.version || 1),
        payload: eventData.payload || {},
        createdAt: new Date().toISOString(),
      };
      data.events.push(rec);
      return { ...rec };
    });
  },

  async getMissedEvents(lastEventId, user, hoursLimit = 24) {
    const numericId = Number(lastEventId || 0);
    const isStaffOrAdmin = user && (user.role === 'admin' || user.role === 'staff');
    const userId = user?.id ? Number(user.id) : null;
    const cutoffTime = new Date(Date.now() - hoursLimit * 60 * 60 * 1000).toISOString();

    const allEvents = store.getCollection('events') || [];

    return allEvents
      .filter((ev) => {
        if (Number(ev.id) <= numericId) return false;
        if (ev.createdAt < cutoffTime) return false;
        if (isStaffOrAdmin) return true;
        return ev.userId === null || Number(ev.userId) === userId;
      })
      .sort((a, b) => Number(a.id) - Number(b.id))
      .slice(0, 500);
  },
};

module.exports = eventRepo;
