const store = require('../store');

const documentRepo = {
  async findByUserId(userId) {
    const num = Number(userId);
    const user = store.getCollection('users').find((u) => Number(u.id) === num);
    if (!user) return [];
    const docs = user.documents || { ktp: 'not_uploaded', sim: 'not_uploaded' };
    const paths = user.documentPaths || {};
    const meta = user.documentMeta || {};
    return Object.entries(docs).map(([type, status]) => {
      const docMeta = meta[type] || {};
      const fp = paths[type] || null;
      const storedName = docMeta.storedName || (fp ? String(fp).split('/').pop() : null);
      const uploadedAt = docMeta.uploadedAt || user.createdAt || new Date().toISOString();
      return {
        userId: num,
        type,
        status,
        storedName,
        stored_name: storedName,
        filePath: fp,
        file_path: fp,
        uploadedAt,
        updatedAt: uploadedAt,
        uploaded_at: uploadedAt,
        updated_at: uploadedAt,
        reviewerNote: docMeta.rejectionReason || null,
      };
    });
  },

  async findByUserIdAndType(userId, type) {
    const docs = await this.findByUserId(userId);
    return docs.find((d) => d.type === type) || null;
  },

  async upsert(docData) {
    return store.withLock(async (data) => {
      const { userId, type, status, filePath, fileName, storedName, sizeBytes, mimeType } = docData;
      const user = data.users.find((u) => Number(u.id) === Number(userId));
      const nowIso = new Date().toISOString();
      const finalStoredName = storedName || fileName || (filePath ? String(filePath).split('/').pop() : null);
      if (user) {
        if (!user.documents) user.documents = { ktp: 'not_uploaded', sim: 'not_uploaded' };
        if (!user.documentPaths) user.documentPaths = {};
        if (!user.documentMeta) user.documentMeta = {};
        if (status) user.documents[type] = status;
        if (filePath) user.documentPaths[type] = filePath;
        user.documentMeta[type] = {
          ...(user.documentMeta[type] || {}),
          storedName: finalStoredName,
          sizeBytes: sizeBytes || 0,
          mimeType: mimeType || 'image/jpeg',
          uploadedAt: nowIso,
          updatedAt: nowIso,
          rejectionReason: null,
        };
      }
      return {
        userId,
        type,
        status,
        storedName: finalStoredName,
        filePath,
        uploadedAt: nowIso,
        updatedAt: nowIso,
      };
    });
  },

  async findAll(filter = {}, paging = {}) {
    const users = store.getCollection('users');
    let list = [];
    users.forEach((u) => {
      const docs = u.documents || { ktp: 'not_uploaded', sim: 'not_uploaded' };
      const paths = u.documentPaths || {};
      const meta = u.documentMeta || {};
      ['ktp', 'sim'].forEach((type) => {
        const status = docs[type] || 'not_uploaded';
        const docMeta = meta[type] || {};
        const fp = paths[type] || null;
        const storedName = docMeta.storedName || (fp ? String(fp).split('/').pop() : null);
        const uploadedIso = docMeta.uploadedAt || u.createdAt || new Date().toISOString();
        list.push({
          id: `doc-${u.id}-${type}`,
          userId: u.id,
          userName: u.name,
          userEmail: u.email,
          userPhone: u.phone,
          type,
          status,
          storedName,
          stored_name: storedName,
          filePath: fp,
          file_path: fp,
          fileUrl: `/api/admin/documents/${u.id}/${type}/file`,
          rejectionReason: docMeta.rejectionReason || null,
          reviewerNote: docMeta.rejectionReason || null,
          verifiedData: docMeta.verifiedData || null,
          uploadedAt: uploadedIso,
          updatedAt: uploadedIso,
          uploaded_at: uploadedIso,
          updated_at: uploadedIso,
          reviewedAt: docMeta.reviewedAt || null,
          reviewerId: docMeta.reviewerId || null,
        });
      });
    });

    if (filter.status && filter.status !== 'all') {
      list = list.filter((d) => d.status === filter.status);
    }
    if (filter.type && filter.type !== 'all') {
      list = list.filter((d) => d.type === filter.type);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (d) =>
          d.userName.toLowerCase().includes(q) ||
          d.userEmail.toLowerCase().includes(q) ||
          (d.userPhone && d.userPhone.includes(q)),
      );
    }

    list.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));

    const total = list.length;
    const page = Math.max(1, parseInt(paging.page ?? filter.page, 10) || 1);
    const limit = Math.max(1, parseInt(paging.limit ?? filter.limit, 10) || 10);
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

    return { items, total, page, limit };
  },

  async updateStatus(userId, type, status, metaPayload = {}) {
    return store.withLock(async (data) => {
      const user = data.users.find((u) => Number(u.id) === Number(userId));
      if (user) {
        if (!user.documents) user.documents = { ktp: 'not_uploaded', sim: 'not_uploaded' };
        if (!user.documentMeta) user.documentMeta = {};
        user.documents[type] = status;
        const reason = typeof metaPayload === 'string' ? metaPayload : metaPayload.rejectionReason;
        user.documentMeta[type] = {
          rejectionReason: reason || null,
          reviewerId: metaPayload.reviewerId || null,
          verifiedData: metaPayload.verifiedData || null,
          reviewedAt: new Date().toISOString(),
        };
        return {
          userId,
          type,
          status,
          rejectionReason: reason || null,
          verifiedData: metaPayload.verifiedData || null,
        };
      }
      return null;
    });
  },
};

module.exports = documentRepo;
