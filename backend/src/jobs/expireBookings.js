const { store } = require('../repositories');
const { BOOKING_STATUS } = require('../config/constants');
const env = require('../config/env');
const logger = require('../utils/logger');
const { pool } = require('../../db/pool');
const eventBroadcaster = require('../services/realtime/eventBroadcaster');

let isRunning = false;
const EXPIRE_ADVISORY_LOCK_ID = 88776655;

/**
 * Job untuk membatalkan booking berstatus 'pending' yang melewati batas waktu expiresAt.
 * Dilengkapi flag isRunning dan pg_try_advisory_lock untuk mencegah eksekusi bertumpuk.
 */
async function expireBookingsJob() {
  if (isRunning) {
    logger.debug('[CRON] expireBookingsJob dilewati karena iterasi sebelumnya masih berjalan.');
    return;
  }

  isRunning = true;
  try {
    if (env.USE_DB === 'postgres') {
      const client = await pool.connect();
      try {
        const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [EXPIRE_ADVISORY_LOCK_ID]);
        if (!lockRes.rows[0].locked) {
          logger.debug('[CRON] pg_try_advisory_lock tidak diperoleh; instance lain sedang menjalankan expireBookingsJob.');
          return;
        }

        try {
const clock = require('../utils/clock');
          const testNow = (process.env.NODE_ENV === 'test') ? clock.nowIso() : null;
          const queryStr = testNow
            ? `UPDATE bookings SET status = 'expired', updated_at = $1 WHERE status = 'pending' AND expires_at < $1 RETURNING id, promo_code_id`
            : `UPDATE bookings SET status = 'expired', updated_at = now() WHERE status = 'pending' AND expires_at < now() RETURNING id, promo_code_id`;
          const queryParams = testNow ? [testNow] : [];
          const res = await client.query(queryStr, queryParams);

          for (const row of res.rows) {
            // Tambahkan timeline expired
            await client.query(`
              INSERT INTO booking_timeline (booking_id, status, note, actor, at)
              VALUES ($1, 'expired', 'Pemesanan kedaluwarsa otomatis karena batas waktu pembayaran telah habis.', 'system', now())
            `, [row.id]);

            // Lepaskan promo redemption bila ada
            const relRes = await client.query(`
              UPDATE promo_redemptions
              SET released_at = now()
              WHERE booking_id = $1 AND released_at IS NULL
              RETURNING promo_id
            `, [row.id]);

            if (relRes.rows.length > 0) {
              await client.query(`
                UPDATE promo_codes
                SET used_count = GREATEST(0, used_count - 1), updated_at = now()
                WHERE id = $1
              `, [relRes.rows[0].promo_id]);
            }

            // Kembalikan status motor ke 'active' (tersedia) jika tidak ada booking aktif lain
            if (row.motorcycle_id) {
              const activeBookingRes = await client.query(
                `SELECT 1 FROM bookings WHERE motorcycle_id = $1 AND status IN ('pending', 'confirmed', 'active') AND id <> $2 LIMIT 1`,
                [row.motorcycle_id, row.id],
              );
              if (activeBookingRes.rows.length === 0) {
                await client.query(
                  "UPDATE motorcycles SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'rented'",
                  [row.motorcycle_id],
                );
              }
            }

            // Realtime Outbox Events: Booking Expired
            await eventBroadcaster.publish(client, {
              type: 'booking.updated',
              entityId: String(row.id),
              userId: null,
              payload: { id: row.id, status: 'expired' },
            });
            await eventBroadcaster.publish(client, {
              type: 'motor.availability.changed',
              entityId: 'all',
              userId: null,
              payload: { action: 'expired_slots_released' },
            });
          }

          if (res.rows.length > 0) {
            logger.info(`[CRON] ${res.rows.length} booking pending telah kedaluwarsa dan diubah menjadi 'expired'. Unit motor kini tersedia kembali.`);
          }
        } finally {
          await client.query('SELECT pg_advisory_unlock($1)', [EXPIRE_ADVISORY_LOCK_ID]);
        }
      } finally {
        client.release();
      }
    } else {
      // Driver In-Memory fallback
      const nowIso = new Date().toISOString();

      await store.withLock(async (data) => {
        let expiredCount = 0;

        data.bookings.forEach((booking) => {
          if (booking.status === BOOKING_STATUS.PENDING) {
            const isExpired = booking.expiresAt
              ? booking.expiresAt <= nowIso
              : (Date.now() - new Date(booking.createdAt).getTime()) >= 60 * 60 * 1000;

            if (isExpired) {
              booking.status = BOOKING_STATUS.EXPIRED;
              booking.expiredAt = nowIso;
              booking.updatedAt = nowIso;

              if (!Array.isArray(booking.timeline)) {
                booking.timeline = [];
              }
              booking.timeline.push({
                status: BOOKING_STATUS.EXPIRED,
                at: nowIso,
                note: 'Pemesanan kedaluwarsa otomatis karena batas waktu pembayaran telah habis.',
              });

              // Kembalikan kuota promo jika digunakan
              if (booking.promoCode) {
                const promo = data.promos.find(
                  (p) => p.code.toUpperCase() === booking.promoCode.toUpperCase(),
                );
                if (promo) promo.quota += 1;
              }

              expiredCount++;
            }
          }
        });

        if (expiredCount > 0) {
          logger.info(`[CRON] ${expiredCount} booking pending telah kedaluwarsa dan diubah menjadi 'expired'. Unit motor kini tersedia kembali.`);
        }
      });
    }
  } catch (err) {
    logger.error('[CRON] Gagal menjalankan expireBookingsJob:', err);
  } finally {
    isRunning = false;
  }
}

module.exports = expireBookingsJob;

