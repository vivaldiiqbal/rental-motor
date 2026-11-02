const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const logger = require('../utils/logger');
const { generateSeedData } = require('../seeds/loadSeed');

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BAK_FILE = path.join(DATA_DIR, 'db.json.bak');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

const lockStorage = new AsyncLocalStorage();

class SimpleMutex {
  constructor() {
    this._queue = Promise.resolve();
  }

  runExclusive(callback) {
    const next = this._queue.then(async () => {
      return await callback();
    });
    // Menghindari unhandled rejection pada antrean
    this._queue = next.catch(() => {});
    return next;
  }
}


/**
 * Validasi bentuk struktur data database agar bebas crash bila file korup.
 */
function isValidDatabaseShape(data) {
  if (!data || typeof data !== 'object') return false;
  const requiredCollections = ['users', 'motors', 'reviews', 'bookings', 'serviceBlocks', 'promos', 'favorites', 'contacts'];
  return requiredCollections.every((col) => Array.isArray(data[col]));
}

class MemoryStore {
  constructor() {
    this.data = {
      users: [],
      motors: [],
      reviews: [],
      bookings: [],
      serviceBlocks: [],
      promos: [],
      favorites: [],
      contacts: [],
      auditLogs: [],
      handovers: [],
      returns: [],
      bookingNotes: [],
      settings: null,
      addons: [],
      locations: [],
      pages: [],
      pageVersions: [],
      faqs: [],
      contentBlocks: [],
      pricingRules: [],
      discountTiers: [],
      renterProfiles: [],
      payments: [],
      events: [],
      gpsDevices: [],
      gpsPositions: [],
      geofences: [],
      gpsAlerts: [],
      gpsAccessLogs: [],
    };
    this.mutex = new SimpleMutex();
    this.persistTimer = null;
    this.isLoaded = false;
  }

  /**
   * Muat data saat server start.
   * Coba baca data/db.json; jika rusak/tidak valid, otomatis pakai data/db.json.bak atau data/seed.json.
   */
  init() {
    if (this.isLoaded) return;

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let loaded = null;

    // 1. Coba muat db.json utama
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (isValidDatabaseShape(parsed)) {
          loaded = parsed;
          logger.info('Berhasil memuat database memori dari data/db.json');
        } else {
          logger.warn('Struktur data/db.json tidak valid (kolom array wajib tidak lengkap).');
        }
      } catch (err) {
        logger.warn(`File db.json rusak atau tidak valid (${err.message}). Mencoba backup db.json.bak...`);
      }
    }

    // 2. Fallback ke db.json.bak jika db.json rusak/hilang
    if (!loaded && fs.existsSync(BAK_FILE)) {
      try {
        const rawBak = fs.readFileSync(BAK_FILE, 'utf-8');
        const parsedBak = JSON.parse(rawBak);
        if (isValidDatabaseShape(parsedBak)) {
          loaded = parsedBak;
          logger.info('Berhasil memulihkan database dari file backup data/db.json.bak');
        }
      } catch (err) {
        logger.warn(`File backup db.json.bak juga tidak valid (${err.message}).`);
      }
    }

    // 3. Fallback ke seed.json
    if (!loaded && fs.existsSync(SEED_FILE)) {
      try {
        const rawSeed = fs.readFileSync(SEED_FILE, 'utf-8');
        const parsedSeed = JSON.parse(rawSeed);
        if (isValidDatabaseShape(parsedSeed)) {
          loaded = parsedSeed;
          logger.info('Berhasil memuat data awal dari data/seed.json');
        }
      } catch (err) {
        logger.warn(`File seed.json rusak (${err.message}). Meng-generate data seed baru...`);
      }
    }

    // 4. Fallback terakhir: generate seed baru jika semua berkas tidak ada
    if (!loaded) {
      loaded = generateSeedData();
      try {
        fs.writeFileSync(SEED_FILE, JSON.stringify(loaded, null, 2), 'utf-8');
      } catch {
        /* ignore */
      }
    }

    this.data = {
      users: Array.isArray(loaded.users) ? loaded.users : [],
      motors: Array.isArray(loaded.motors) ? loaded.motors : [],
      reviews: Array.isArray(loaded.reviews) ? loaded.reviews : [],
      bookings: Array.isArray(loaded.bookings) ? loaded.bookings : [],
      serviceBlocks: Array.isArray(loaded.serviceBlocks) ? loaded.serviceBlocks : [],
      promos: Array.isArray(loaded.promos) ? loaded.promos : [],
      favorites: Array.isArray(loaded.favorites) ? loaded.favorites : [],
      contacts: Array.isArray(loaded.contacts) ? loaded.contacts : [],
      auditLogs: Array.isArray(loaded.auditLogs) ? loaded.auditLogs : [],
      handovers: Array.isArray(loaded.handovers) ? loaded.handovers : [],
      returns: Array.isArray(loaded.returns) ? loaded.returns : [],
      bookingNotes: Array.isArray(loaded.bookingNotes) ? loaded.bookingNotes : [],
      settings: (loaded.settings && typeof loaded.settings === 'object') ? loaded.settings : null,
      addons: Array.isArray(loaded.addons) ? loaded.addons : [],
      locations: Array.isArray(loaded.locations) ? loaded.locations : [],
      pages: Array.isArray(loaded.pages) ? loaded.pages : [],
      pageVersions: Array.isArray(loaded.pageVersions) ? loaded.pageVersions : [],
      faqs: Array.isArray(loaded.faqs) ? loaded.faqs : [],
      contentBlocks: Array.isArray(loaded.contentBlocks) ? loaded.contentBlocks : [],
      pricingRules: Array.isArray(loaded.pricingRules) ? loaded.pricingRules : [],
      discountTiers: Array.isArray(loaded.discountTiers) ? loaded.discountTiers : [],
      renterProfiles: Array.isArray(loaded.renterProfiles) ? loaded.renterProfiles : [],
    };

    this.isLoaded = true;
    this.persistSync(); // Pastikan tersimpan di db.json dan db.json.bak
  }

  /**
   * Mengambil referensi koleksi (array) dari memori dengan perlindungan safe access.
   */
  getCollection(name) {
    if (!this.isLoaded) this.init();
    if (!this.data[name] || !Array.isArray(this.data[name])) {
      this.data[name] = [];
    }
    return this.data[name];
  }

  /**
   * Menetapkan koleksi baru dan menjadwalkan persist debounced.
   */
  setCollection(name, items) {
    if (!this.isLoaded) this.init();
    this.data[name] = Array.isArray(items) ? items : [];
    this.schedulePersist();
  }

  /**
   * Eksekusi fungsi kritis di dalam critical section mutex.
   * Mendukung pemanggilan re-entrant agar aman dipanggil bersarang di dalam transaksi.
   */
  async withLock(action) {
    if (!this.isLoaded) this.init();

    // Jika sudah di dalam konteks withLock, jalankan langsung tanpa deadlock
    if (lockStorage.getStore()) {
      return await action(this.data);
    }

    return this.mutex.runExclusive(async () => {
      return await lockStorage.run(true, async () => {
        const result = await action(this.data);
        this.schedulePersist();
        return result;
      });
    });
  }

  /**
   * Jadwalkan persistensi ke file JSON dengan debounce 300 ms.
   */
  schedulePersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistAtomic();
    }, 300);
  }

  /**
   * Tulis data secara atomik: tulis ke file sementara lalu rename dan update backup.
   */
  persistAtomic() {
    try {
      const tempFile = path.join(DATA_DIR, `db.json.tmp.${Date.now()}`);
      const payload = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tempFile, payload, 'utf-8');

      // Update backup jika db.json lama ada
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, BAK_FILE);
        } catch {
          /* ignore */
        }
      }

      fs.renameSync(tempFile, DB_FILE);
      logger.debug('Data memori berhasil dipersistenkan secara atomik ke data/db.json');
    } catch (err) {
      logger.error(`Gagal melakukan persist atomik ke db.json: ${err.message}`);
    }
  }

  /**
   * Tulis data secara sinkron (dipakai saat shutdown atau test teardown).
   */
  persistSync() {
    try {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      const tempFile = path.join(DATA_DIR, `db.json.tmp.${Date.now()}`);
      const payload = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tempFile, payload, 'utf-8');

      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, BAK_FILE);
        } catch {
          /* ignore */
        }
      }

      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      logger.error(`Gagal persistSync: ${err.message}`);
    }
  }

  /**
   * Reset data memori ke data seed awal (untuk keperluan testing).
   */
  resetToSeed() {
    this.isLoaded = false;
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.unlinkSync(DB_FILE);
      } catch {
        /* ignore */
      }
    }
    if (fs.existsSync(BAK_FILE)) {
      try {
        fs.unlinkSync(BAK_FILE);
      } catch {
        /* ignore */
      }
    }
    this.init();
  }
}

const store = new MemoryStore();
module.exports = store;
