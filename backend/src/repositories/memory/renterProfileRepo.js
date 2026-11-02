const store = require('../store');

const renterProfileRepo = {
  async findByUserId(userId) {
    const list = store.getCollection('renterProfiles');
    const numericId = Number(userId);
    const found = list.find((p) => Number(p.userId) === numericId);
    return found ? { ...found } : null;
  },

  async findByNikHash(nikHash) {
    if (!nikHash) return null;
    const list = store.getCollection('renterProfiles');
    const found = list.find((p) => p.nikHash === nikHash);
    return found ? { ...found } : null;
  },

  async upsert(userId, data) {
    return store.withLock(async (storeData) => {
      if (!storeData.renterProfiles) {
        storeData.renterProfiles = [];
      }
      const numericId = Number(userId);
      const idx = storeData.renterProfiles.findIndex((p) => Number(p.userId) === numericId);

      const record = {
        userId: numericId,
        fullNameKtp: data.fullNameKtp,
        birthDate: data.birthDate,
        nikHash: data.nikHash,
        nikLast4: data.nikLast4,
        addressKtp: data.addressKtp,
        phoneE164: data.phoneE164,
        stayAddress: data.stayAddress,
        emergencyName: data.emergencyName,
        emergencyRelation: data.emergencyRelation,
        emergencyPhone: data.emergencyPhone,
        emergencyContact: {
          name: data.emergencyName,
          relation: data.emergencyRelation,
          phone: data.emergencyPhone,
        },
        termsVersionAccepted: data.termsVersionAccepted || 1,
        privacyVersionAccepted: data.privacyVersionAccepted || 1,
        gpsConsentAt: data.gpsConsentAt || new Date().toISOString(),
        completedAt: data.completedAt || null,
        createdAt: idx >= 0 ? storeData.renterProfiles[idx].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (idx >= 0) {
        storeData.renterProfiles[idx] = record;
      } else {
        storeData.renterProfiles.push(record);
      }

      return { ...record };
    });
  },

  async delete(userId) {
    return store.withLock(async (storeData) => {
      if (!storeData.renterProfiles) return false;
      const numericId = Number(userId);
      const initialLen = storeData.renterProfiles.length;
      storeData.renterProfiles = storeData.renterProfiles.filter((p) => Number(p.userId) !== numericId);
      return storeData.renterProfiles.length < initialLen;
    });
  },
};

module.exports = renterProfileRepo;
