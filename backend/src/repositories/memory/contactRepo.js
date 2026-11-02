const store = require('../store');

/**
 * Kontrak Contact Repository:
 * - create(data): Promise<Contact>
 * - findAll(paging): Promise<{ items: Contact[], total: number }>
 * - findById(id): Promise<Contact | null>
 */
const contactRepo = {
  async create(contactData) {
    return store.withLock(async (data) => {
      const nextId = data.contacts.length > 0 ? Math.max(...data.contacts.map((c) => Number(c.id) || 0)) + 1 : 1;
      const newContact = {
        id: nextId,
        read: false,
        createdAt: new Date().toISOString(),
        ...contactData,
      };
      data.contacts.unshift(newContact);
      return { ...newContact };
    });
  },

  async findAll(paging = {}) {
    const list = store.getCollection('contacts').map((c) => ({ ...c }));
    const total = list.length;
    const page = paging.page || 1;
    const limit = paging.limit || 20;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);
    return { items, total };
  },

  async findById(id) {
    const contacts = store.getCollection('contacts');
    const numericId = Number(id);
    const item = contacts.find((c) => c.id === numericId || String(c.id) === String(id));
    return item ? { ...item } : null;
  },

  async markRead(id) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const item = data.contacts.find((c) => c.id === numericId || String(c.id) === String(id));
      if (!item) return null;
      item.read = true;
      item.readAt = new Date().toISOString();
      return { ...item };
    });
  },

  async reply(id, replyText, repliedBy = null) {
    return store.withLock(async (data) => {
      const numericId = Number(id);
      const item = data.contacts.find((c) => c.id === numericId || String(c.id) === String(id));
      if (!item) return null;
      item.read = true;
      item.readAt = item.readAt || new Date().toISOString();
      item.repliedAt = new Date().toISOString();
      item.repliedBy = repliedBy;
      item.replyMessage = replyText;
      return { ...item };
    });
  },
};

module.exports = contactRepo;
