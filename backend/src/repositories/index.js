const env = require('../config/env');
const store = require('./store');
const logger = require('../utils/logger');

// Inisialisasi awal database memori jika USE_DB === 'memory'
if (env.USE_DB === 'memory') {
  store.init();
}

const driver = env.USE_DB === 'postgres' ? 'postgres' : 'memory';

const userRepo = require(`./${driver}/userRepo`);
const documentRepo = require(`./${driver}/documentRepo`);
const motorRepo = require(`./${driver}/motorRepo`);
const bookingRepo = require(`./${driver}/bookingRepo`);
const paymentRepo = require(`./${driver}/paymentRepo`);
const reviewRepo = require(`./${driver}/reviewRepo`);
const favoriteRepo = require(`./${driver}/favoriteRepo`);
const promoRepo = require(`./${driver}/promoRepo`);
const contactRepo = require(`./${driver}/contactRepo`);
const idempotencyRepo = require(`./${driver}/idempotencyRepo`);
const metaRepo = require(`./${driver}/metaRepo`);

// Repositori Admin (dukungan memory dan postgres)
const handoverRepo = require(`./${driver}/handoverRepo`);
const returnRepo = require(`./${driver}/returnRepo`);
const bookingNoteRepo = require(`./${driver}/bookingNoteRepo`);
const auditRepo = require(`./${driver}/auditRepo`);
const settingsRepo = require(`./${driver}/settingsRepo`);
const maintenanceRepo = require(`./${driver}/maintenanceRepo`);
const addonRepo = require(`./${driver}/addonRepo`);
const locationRepo = require(`./${driver}/locationRepo`);
const reportRepo = require(`./${driver}/reportRepo`);
const contentRepo = require(`./${driver}/contentRepo`);
const pricingRepo = require(`./${driver}/pricingRepo`);
const renterProfileRepo = require(`./${driver}/renterProfileRepo`);
const eventRepo = require(`./${driver}/eventRepo`);
const gpsRepo = require(`./${driver}/gpsRepo`);

function bindPostgresRepo(repo, client) {
  const bound = {};
  for (const [key, fn] of Object.entries(repo)) {
    if (typeof fn === 'function') {
      bound[key] = (...args) => {
        const lastArg = args[args.length - 1];
        if (lastArg && typeof lastArg.query === 'function') {
          return fn.apply(repo, args);
        }
        if (key === 'findAll') {
          const [filter = {}, paging = {}] = args;
          return fn.call(repo, filter, paging, client);
        }
        if (key === 'findOverlapping') {
          const [mId, sDate, eDate, excId = null] = args;
          return fn.call(repo, mId, sDate, eDate, excId, client);
        }
        if (key === 'findBlockedRanges') {
          const [mId, fromDate = null, toDate = null] = args;
          return fn.call(repo, mId, fromDate, toDate, client);
        }
        if (key === 'countStatusSummary') {
          const [filter = {}] = args;
          return fn.call(repo, filter, client);
        }
        if (key === 'findConflictingForMotor') {
          const [mId, fromDate = null] = args;
          return fn.call(repo, mId, fromDate, client);
        }
        if (key === 'countActiveAdmins') {
          const [excId = null] = args;
          return fn.call(repo, excId, client);
        }
        if (key === 'findByPlate') {
          const [plate, excId = null] = args;
          return fn.call(repo, plate, excId, client);
        }
        if (key === 'setVisibility') {
          const [id, isVisible, reason = null] = args;
          return fn.call(repo, id, isVisible, reason, client);
        }
        if (key === 'updateStatus') {
          const [userId, type, status, meta = null] = args;
          return fn.call(repo, userId, type, status, meta, client);
        }
        if (key === 'getSettings') {
          return fn.call(repo, client);
        }
        if (key === 'updateSettings') {
          const [patch = {}] = args;
          return fn.call(repo, patch, client);
        }
        if (key === 'resetSettings') {
          return fn.call(repo, client);
        }
        if (key === 'countUnread') {
          return fn.call(repo, client);
        }
        if (key === 'markRead') {
          const [id] = args;
          return fn.call(repo, id, client);
        }
        if (key === 'getRevenueReport') {
          const [sDate, eDate, grp = 'daily'] = args;
          return fn.call(repo, sDate, eDate, grp, client);
        }
        if (key === 'getUtilizationReport') {
          const [sDate, eDate] = args;
          return fn.call(repo, sDate, eDate, client);
        }
        if (key === 'getTopMotorsReport') {
          const [sDate, eDate, lim = 5] = args;
          return fn.call(repo, sDate, eDate, lim, client);
        }
        if (key === 'getBookingsSummaryReport') {
          const [sDate, eDate] = args;
          return fn.call(repo, sDate, eDate, client);
        }
        if (key === 'getDashboardSummary') {
          return fn.call(repo, client);
        }
        return fn.call(repo, ...args, client);
      };
    } else {
      bound[key] = fn;
    }
  }
  return bound;
}

/**
 * Abstraksi transaksi atomik untuk seluruh operasi multi-tabel.
 *
 * Driver Memory:
 * - Dijalankan dalam critical section mutex (store.withLock).
 * - Deep snapshot data sebelum eksekusi; rollback salinan data jika terjadi exception.
 *
 * Driver PostgreSQL:
 * - BEGIN -> jalankan callback(tx) -> COMMIT.
 * - ROLLBACK jika terjadi exception; client.release() SELALU di finally.
 * - Retry otomatis maks 3 kali dengan jeda acak singkat (25-100ms) HANYA untuk
 *   error 40001 (serialization_failure) dan 40P01 (deadlock_detected). Error lain tidak di-retry.
 */
async function transaction(callback) {
  if (env.USE_DB === 'memory') {
    return await store.withLock(async () => {
      const snapshot = JSON.stringify(store.data);
      try {
        const tx = {
          driver: 'memory',
          client: null,
          query: async () => ({ rows: [] }),
          userRepo,
          documentRepo,
          motorRepo,
          bookingRepo,
          paymentRepo,
          reviewRepo,
          favoriteRepo,
          promoRepo,
          contactRepo,
          idempotencyRepo,
          metaRepo,
          handoverRepo,
          returnRepo,
          bookingNoteRepo,
          auditRepo,
          settingsRepo,
          maintenanceRepo,
          addonRepo,
          locationRepo,
          reportRepo,
          contentRepo,
          pricingRepo,
          renterProfileRepo,
          eventRepo,
          gpsRepo,
        };
        return await callback(tx);
      } catch (err) {
        store.data = JSON.parse(snapshot);
        throw err;
      }
    });
  }

  const { pool } = require('../../db/pool');
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (true) {
    attempt++;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        driver: 'postgres',
        client,
        query: (text, params) => client.query(text, params),
        userRepo: bindPostgresRepo(userRepo, client),
        documentRepo: bindPostgresRepo(documentRepo, client),
        motorRepo: bindPostgresRepo(motorRepo, client),
        bookingRepo: bindPostgresRepo(bookingRepo, client),
        paymentRepo: bindPostgresRepo(paymentRepo, client),
        reviewRepo: bindPostgresRepo(reviewRepo, client),
        favoriteRepo: bindPostgresRepo(favoriteRepo, client),
        promoRepo: bindPostgresRepo(promoRepo, client),
        contactRepo: bindPostgresRepo(contactRepo, client),
        idempotencyRepo: bindPostgresRepo(idempotencyRepo, client),
        metaRepo: bindPostgresRepo(metaRepo, client),
        handoverRepo: bindPostgresRepo(handoverRepo, client),
        returnRepo: bindPostgresRepo(returnRepo, client),
        bookingNoteRepo: bindPostgresRepo(bookingNoteRepo, client),
        auditRepo: bindPostgresRepo(auditRepo, client),
        settingsRepo: bindPostgresRepo(settingsRepo, client),
        maintenanceRepo: bindPostgresRepo(maintenanceRepo, client),
        addonRepo: bindPostgresRepo(addonRepo, client),
        locationRepo: bindPostgresRepo(locationRepo, client),
        reportRepo: bindPostgresRepo(reportRepo, client),
        contentRepo: bindPostgresRepo(contentRepo, client),
        pricingRepo: bindPostgresRepo(pricingRepo, client),
        renterProfileRepo: bindPostgresRepo(renterProfileRepo, client),
        eventRepo: bindPostgresRepo(eventRepo, client),
        gpsRepo: bindPostgresRepo(gpsRepo, client),
      };
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        // Abaikan error sekunder saat rollback
      }

      if ((err.code === '40001' || err.code === '40P01') && attempt < MAX_RETRIES) {
        const delay = Math.floor(Math.random() * 75) + 25; // 25ms - 100ms
        logger.warn(
          `[TX RETRY] Error ${err.code} (${err.code === '40001' ? 'serialization_failure' : 'deadlock_detected'}) pada percobaan ${attempt}. Menunggu ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = {
  driver,
  store,
  transaction,
  userRepo,
  documentRepo,
  motorRepo,
  bookingRepo,
  paymentRepo,
  reviewRepo,
  favoriteRepo,
  promoRepo,
  contactRepo,
  idempotencyRepo,
  metaRepo,
  handoverRepo,
  returnRepo,
  bookingNoteRepo,
  auditRepo,
  settingsRepo,
  maintenanceRepo,
  addonRepo,
  locationRepo,
  reportRepo,
  contentRepo,
  pricingRepo,
  renterProfileRepo,
  eventRepo,
  gpsRepo,
};
