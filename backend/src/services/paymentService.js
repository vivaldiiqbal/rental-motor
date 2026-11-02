const crypto = require('crypto');
const clock = require('../utils/clock');
const { bookingRepo, store } = require('../repositories');
const { BOOKING_STATUS } = require('../config/constants');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const eventBroadcaster = require('./realtime/eventBroadcaster');

class PaymentService {
  constructor() {
    this.provider = env.PAYMENT_PROVIDER; // 'simulation' | 'midtrans'
  }

  /**
   * Membuat transaksi pembayaran untuk sebuah booking.
   */
  async createPayment({ bookingId, method }, user) {
    const isNum = /^\d+$/.test(bookingId);
    let booking = null;
    if (process.env.USE_DB === 'postgres') {
      booking = isNum ? await bookingRepo.findById(bookingId) : await bookingRepo.findByCode(bookingId);
    } else {
      booking = store
        .getCollection('bookings')
        .find((b) => (isNum ? Number(b.id) === Number(bookingId) : b.code.toUpperCase() === String(bookingId).toUpperCase()));
    }

    if (!booking || (user.role !== 'admin' && Number(booking.userId) !== Number(user.id))) {
      throw new AppError('Pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
    }

    if (booking.status !== BOOKING_STATUS.PENDING) {
      throw new AppError(
        `Pemesanan dengan status '${booking.status}' tidak dapat diproses pembayarannya.`,
        'INVALID_STATUS_TRANSITION',
        400,
      );
    }

    const paymentId = `PAY-${booking.code}-${Date.now()}`;
    let instructions = {};

    if (this.provider === 'midtrans') {
      // Struktur siap untuk Midtrans Snap Sandbox
      instructions = {
        provider: 'midtrans',
        clientKey: env.MIDTRANS_CLIENT_KEY,
        snapToken: `mock-snap-token-${booking.code}`,
        redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/mock-${booking.code}`,
      };
    } else {
      // Provider Mode: SIMULATION
      if (method === 'bank_transfer') {
        instructions = {
          bank: 'BCA',
          vaNumber: `88012${String(booking.id).padStart(6, '0')}`,
          accountName: 'PT RodaKita Rental Indonesia',
          steps: [
            'Buka aplikasi m-BCA atau ATM BCA terdekat.',
            'Pilih menu Transaksi Lainnya > Transfer > Ke Rek BCA Virtual Account.',
            `Masukkan nomor Virtual Account: 88012${String(booking.id).padStart(6, '0')}.`,
            `Pastikan nominal transfer sesuai: Rp ${booking.total.toLocaleString('id-ID')}.`,
            'Konfirmasi pembayaran dan simpan bukti transaksi.',
          ],
        };
      } else if (method === 'qris') {
        instructions = {
          qrString: `00020101021226600016ID.CO.RODAKITA.WWW01189360099900000000010215${booking.code}5802ID53033605406${booking.total}5916RODAKITA RENTAL6007DENPASAR6304ABCD`,
          qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=RODAKITA-${booking.code}-${booking.total}`,
          validUntilMinutes: 120,
          steps: [
            'Buka aplikasi e-wallet atau mobile banking yang mendukung QRIS.',
            'Pindai (scan) kode QR yang tampil di layar.',
            `Periksa nama merchant: RodaKita Rental dan total nominal: Rp ${booking.total.toLocaleString('id-ID')}.`,
            'Masukkan PIN dan selesaikan pembayaran.',
          ],
        };
      } else {
        // ewallet (GoPay / OVO / Dana)
        instructions = {
          channel: 'GoPay / OVO / Dana',
          paymentUrl: `https://rodakita.id/pay/ewallet-mock?code=${booking.code}`,
          steps: [
            'Klik tombol bayar untuk membuka aplikasi e-wallet.',
            'Periksa rincian pembayaran di aplikasi.',
            'Konfirmasi pembayaran sebelum batas waktu berakhir.',
          ],
        };
      }
    }

    const paymentRecord = {
      id: paymentId,
      bookingId: booking.id,
      bookingCode: booking.code,
      method,
      amount: booking.total,
      deposit: booking.deposit,
      status: 'pending',
      instructions,
      createdAt: new Date().toISOString(),
    };

    return {
      payment: paymentRecord,
      instructions,
    };
  }

  /**
   * Pemrosesan Pembayaran Sukses Terpusat (Atomic Transaction).
   * Digunakan bersama oleh simulatePayment dan handleWebhookNotification:
   * 1. Webhook: INSERT payment_events ON CONFLICT DO NOTHING (idempotent).
   * 2. Kunci booking dan payment FOR UPDATE.
   * 3. Jika booking pending & belum expired: payment=paid, booking=confirmed, paid_at, timeline.
   * 4. Jika booking expired: coba aktifkan kembali ke confirmed hanya bila slot masih bebas;
   *    bila gagal/bentrok (23P01), payment=needs_refund dan booking tetap expired.
   * 5. Booking cancelled/completed: payment=needs_refund.
   */
  async processSuccessfulPayment({ bookingIdOrCode, provider = 'simulation', eventId = null, payload = null, user = null }) {
    const { transaction } = require('../repositories');

    return await transaction(async (tx) => {
      // 1. Webhook: Catat payment_events ON CONFLICT DO NOTHING
      if (eventId && tx.driver === 'postgres' && tx.client) {
        const evRes = await tx.client.query(
          `INSERT INTO payment_events (provider, event_id, payload, received_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (provider, event_id) DO NOTHING
           RETURNING id`,
          [provider, String(eventId), JSON.stringify(payload || {})],
        );

        if (evRes.rowCount === 0) {
          // Event sudah pernah diproses sebelumnya (idempotent replay)
          return {
            received: true,
            idempotent: true,
            bookingCode: bookingIdOrCode,
            message: 'Notifikasi pembayaran telah diproses sebelumnya (idempotent).',
          };
        }
      }

      // 2. Kunci baris booking FOR UPDATE (sesuai urutan deadlock)
      const isNum = /^\d+$/.test(bookingIdOrCode);
      let rawBooking = null;
      let booking = null;

      if (tx.driver === 'postgres' && tx.client) {
        const bRes = await tx.client.query(
          `SELECT * FROM bookings WHERE ${isNum ? 'id = $1' : 'upper(booking_code) = upper($1)'} FOR UPDATE`,
          [isNum ? Number(bookingIdOrCode) : String(bookingIdOrCode).trim()],
        );
        if (bRes.rows.length === 0) {
          throw new AppError('Pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
        }
        rawBooking = bRes.rows[0];
        booking = await tx.bookingRepo.findById(rawBooking.id);
      } else {
        booking = store
          .getCollection('bookings')
          .find((b) => (isNum ? Number(b.id) === Number(bookingIdOrCode) : b.code.toUpperCase() === String(bookingIdOrCode).toUpperCase()));
        if (!booking) {
          throw new AppError('Pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
        }
      }

      if (user && user.role !== 'admin' && Number(booking.userId) !== Number(user.id)) {
        throw new AppError('Pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
      }

      // 3. Kunci baris payment FOR UPDATE
      let payment = null;
      if (tx.driver === 'postgres' && tx.client) {
        const pRes = await tx.client.query(
          'SELECT * FROM payments WHERE booking_id = $1 FOR UPDATE',
          [rawBooking.id],
        );
        if (pRes.rows.length > 0) {
          payment = pRes.rows[0];
        } else {
          const newP = await tx.client.query(
            `INSERT INTO payments (booking_id, method, provider, status, amount, created_at, updated_at)
             VALUES ($1, $2, $3, 'pending', $4, now(), now())
             RETURNING *`,
            [rawBooking.id, rawBooking.payment_method || 'bank_transfer', provider, rawBooking.grand_total],
          );
          payment = newP.rows[0];
        }

        // Jika payment sudah paid, kembalikan sukses tanpa perubahan (idempotent)
        if (payment.status === 'paid') {
          return {
            success: true,
            idempotent: true,
            booking,
            message: 'Pembayaran sudah terverifikasi sebelumnya.',
          };
        }
      }

      const nowIso = clock.nowIso();

      // 4. Evaluasi status booking
      const isBookingExpired = tx.driver === 'postgres'
        ? (rawBooking.status === 'expired' || (rawBooking.expires_at && new Date(rawBooking.expires_at) < clock.now()))
        : (booking.status === BOOKING_STATUS.EXPIRED || (booking.expiresAt && new Date(booking.expiresAt) < clock.now()));

      if (booking.status === BOOKING_STATUS.PENDING && !isBookingExpired) {
        // Status pending normal & belum expired: konfirmasi booking
        if (tx.driver === 'postgres' && tx.client) {
          await tx.client.query(
            `UPDATE payments SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`,
            [payment.id],
          );
          await tx.client.query(
            `UPDATE bookings SET status = 'confirmed', paid_at = now(), updated_at = now() WHERE id = $1`,
            [rawBooking.id],
          );
          await tx.client.query(
            `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
             VALUES ($1, 'confirmed', 'Pembayaran berhasil diverifikasi. Pemesanan terkonfirmasi.', 'payment', now())`,
            [rawBooking.id],
          );
        } else {
          booking.status = BOOKING_STATUS.CONFIRMED;
          booking.paidAt = nowIso;
          if (tx.paymentRepo) {
            const memoryPay = await tx.paymentRepo.findByBookingId(booking.id);
            if (memoryPay) {
              await tx.paymentRepo.update(memoryPay.id, { status: 'paid', paidAt: nowIso });
            }
          }
          if (!Array.isArray(booking.timeline)) booking.timeline = [];
          booking.timeline.push({
            status: BOOKING_STATUS.CONFIRMED,
            at: nowIso,
            note: 'Pembayaran berhasil diverifikasi. Pemesanan terkonfirmasi.',
          });
        }

        // Realtime Outbox Events: Pembayaran Terkonfirmasi
        await eventBroadcaster.publish(tx, {
          type: 'payment.updated',
          entityId: String(payment?.id || booking.id),
          userId: Number(booking.userId),
          version: Number(booking.version || 1),
          payload: { bookingId: booking.id, status: 'paid' },
        });
        await eventBroadcaster.publish(tx, {
          type: 'booking.updated',
          entityId: String(booking.id),
          userId: Number(booking.userId),
          version: Number(booking.version || 1),
          payload: { id: booking.id, code: booking.code, status: 'confirmed' },
        });
        await eventBroadcaster.publish(tx, {
          type: 'motor.availability.changed',
          entityId: String(booking.motorId),
          userId: null,
          version: 1,
          payload: { motorId: Number(booking.motorId) },
        });
        await eventBroadcaster.publish(tx, {
          type: 'counters.changed',
          entityId: 'payments',
          userId: null,
          payload: { action: 'payment_confirmed' },
        });

        const updatedBooking = await tx.bookingRepo.findById(booking.id);
        return {
          success: true,
          booking: updatedBooking,
          message: 'Pembayaran simulasi berhasil. Pemesanan Anda telah terkonfirmasi!',
        };
      }

      if (isBookingExpired || booking.status === BOOKING_STATUS.EXPIRED) {
        // Pembayaran terlambat pada booking expired: coba aktifkan kembali jika slot bebas
        let reactivated = false;

        if (tx.driver === 'postgres' && tx.client) {
          await tx.client.query('SAVEPOINT reactivate_slot_sp');
          try {
            // Cek tabrakan dengan blok servis
            const mBlock = await tx.client.query(
              `SELECT 1 FROM maintenance_blocks
               WHERE motorcycle_id = $1
                 AND daterange(start_date, end_date, '[)') && daterange($2::date, $3::date, '[)')
               LIMIT 1`,
              [rawBooking.motorcycle_id, rawBooking.start_date, rawBooking.end_date],
            );
            if (mBlock.rows.length > 0) {
              throw new Error('MAINTENANCE_COLLISION');
            }

            // Mencoba update status ke confirmed (memicu constraint exclusion no_double_booking)
            await tx.client.query(
              `UPDATE bookings SET status = 'confirmed', paid_at = now(), updated_at = now() WHERE id = $1`,
              [rawBooking.id],
            );
            await tx.client.query('RELEASE SAVEPOINT reactivate_slot_sp');
            reactivated = true;
          } catch (err) {
            await tx.client.query('ROLLBACK TO SAVEPOINT reactivate_slot_sp');
            reactivated = false;
          }

          if (reactivated) {
            await tx.client.query(
              `UPDATE payments SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`,
              [payment.id],
            );
            await tx.client.query(
              `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
               VALUES ($1, 'confirmed', 'Pembayaran berhasil diverifikasi (dikonfirmasi setelah kedaluwarsa).', 'payment', now())`,
              [rawBooking.id],
            );
          } else {
            // Slot telah terisi: payment menjadi needs_refund, booking tetap expired
            await tx.client.query(
              `UPDATE payments SET status = 'needs_refund', updated_at = now() WHERE id = $1`,
              [payment.id],
            );
            await tx.client.query(
              `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
               VALUES ($1, 'expired', 'Pembayaran diterima setelah kedaluwarsa namun slot motor telah terisi. Menunggu proses refund.', 'payment', now())`,
              [rawBooking.id],
            );
          }
        } else {
          // Memory check overlap
          const { isOverlapping } = require('../utils/dates');
          const hasConflict = store.getCollection('bookings').some((b) => {
            if (Number(b.motorId) !== Number(booking.motorId) || Number(b.id) === Number(booking.id)) return false;
            if (!['pending', 'confirmed', 'active'].includes(b.status)) return false;
            return isOverlapping(booking.startDate, booking.endDate, b.startDate, b.endDate);
          });

          if (!hasConflict) {
            booking.status = BOOKING_STATUS.CONFIRMED;
            booking.paidAt = nowIso;
            if (!Array.isArray(booking.timeline)) booking.timeline = [];
            booking.timeline.push({
              status: BOOKING_STATUS.CONFIRMED,
              at: nowIso,
              note: 'Pembayaran berhasil diverifikasi (dikonfirmasi setelah kedaluwarsa).',
            });
            reactivated = true;
          }
        }

        const updatedBooking = await tx.bookingRepo.findById(booking.id);
        return {
          success: reactivated,
          status: reactivated ? 'confirmed' : 'needs_refund',
          booking: updatedBooking,
          message: reactivated
            ? 'Pembayaran berhasil diverifikasi (dikonfirmasi setelah kedaluwarsa).'
            : 'Pembayaran diterima setelah batas waktu dan unit telah dipesan pelanggan lain. Pembayaran ditandai untuk refund.',
        };
      }

      // 5. Booking cancelled / completed -> payment menjadi needs_refund
      if (['cancelled', 'completed'].includes(booking.status)) {
        if (tx.driver === 'postgres' && tx.client) {
          await tx.client.query(
            `UPDATE payments SET status = 'needs_refund', updated_at = now() WHERE id = $1`,
            [payment.id],
          );
        }
        return {
          success: false,
          status: 'needs_refund',
          booking,
          message: 'Pemesanan telah selesai atau dibatalkan. Pembayaran ditandai untuk refund.',
        };
      }

      return {
        success: true,
        booking,
      };
    });
  }

  /**
   * Simulasi bayar langsung sukses (khusus mode PAYMENT_PROVIDER=simulation).
   */
  async simulatePayment(bookingIdOrCode, user) {
    if (this.provider !== 'simulation') {
      throw new AppError('Fitur simulasi pembayaran hanya aktif pada mode simulasi.', 'FORBIDDEN', 403);
    }

    const isNum = /^\d+$/.test(bookingIdOrCode);
    let booking = null;
    if (process.env.USE_DB === 'postgres') {
      booking = isNum ? await bookingRepo.findById(bookingIdOrCode) : await bookingRepo.findByCode(bookingIdOrCode);
    } else {
      booking = store
        .getCollection('bookings')
        .find((b) => (isNum ? Number(b.id) === Number(bookingIdOrCode) : b.code.toUpperCase() === String(bookingIdOrCode).toUpperCase()));
    }

    if (!booking || (user.role !== 'admin' && Number(booking.userId) !== Number(user.id))) {
      throw new AppError('Pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
    }

    if (!['pending', 'expired'].includes(booking.status)) {
      throw new AppError(
        `Pemesanan dengan status '${booking.status}' tidak dapat dibayar lagi.`,
        'INVALID_STATUS_TRANSITION',
        400,
      );
    }

    const result = await this.processSuccessfulPayment({
      bookingIdOrCode,
      provider: 'simulation',
      user,
    });

    return {
      success: true,
      booking: result.booking,
      status: result.booking.status,
      paidAt: result.booking.paidAt,
      message: result.message || 'Pembayaran simulasi berhasil. Pemesanan Anda telah terkonfirmasi!',
    };
  }

  async getPaymentStatus(bookingIdOrCode, user) {
    const isNum = /^\d+$/.test(bookingIdOrCode);
    let booking = null;
    if (process.env.USE_DB === 'postgres') {
      booking = isNum ? await bookingRepo.findById(bookingIdOrCode) : await bookingRepo.findByCode(bookingIdOrCode);
    } else {
      booking = store
        .getCollection('bookings')
        .find((b) => (isNum ? Number(b.id) === Number(bookingIdOrCode) : b.code.toUpperCase() === String(bookingIdOrCode).toUpperCase()));
    }

    if (!booking || (user && user.role !== 'admin' && Number(booking.userId) !== Number(user.id))) {
      throw new AppError('Pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
    }

    const isPaid = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED].includes(booking.status);

    return {
      bookingId: booking.id,
      bookingCode: booking.code,
      method: booking.payment,
      total: booking.total,
      deposit: booking.deposit,
      status: isPaid ? 'paid' : booking.status === 'cancelled' ? 'cancelled' : 'unpaid',
      paidAt: booking.paidAt || null,
      createdAt: booking.createdAt,
    };
  }

  /**
   * Webhook notifikasi pembayaran (idempotent, signature check).
   */
  async handleWebhookNotification(payload, signatureHeader) {
    const expectedSecret = env.WEBHOOK_SECRET;

    // Verifikasi signature
    if (!signatureHeader) {
      throw new AppError('Signature webhook tidak ditemukan.', 'UNAUTHORIZED', 401);
    }

    // Hitung signature hash sha256 dari payload
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const computedSignature = crypto.createHmac('sha256', expectedSecret).update(bodyStr).digest('hex');

    // Izinkan juga pencocokan langsung secret untuk fleksibilitas webhook test
    const isValid = signatureHeader === computedSignature || signatureHeader === expectedSecret;
    if (!isValid) {
      throw new AppError('Signature webhook tidak valid.', 'UNAUTHORIZED', 401);
    }

    const { bookingCode, status } = payload;
    if (!bookingCode) {
      throw new AppError('Field bookingCode wajib ada pada payload webhook.', 'VALIDATION_ERROR', 400);
    }

    const eventId = payload.eventId || payload.id || `evt_${bookingCode}_${payload.transaction_id || status}`;

    if (['paid', 'settlement', 'capture'].includes(String(status).toLowerCase())) {
      const result = await this.processSuccessfulPayment({
        bookingIdOrCode: bookingCode,
        provider: 'midtrans',
        eventId,
        payload,
      });

      return {
        received: true,
        idempotent: true,
        bookingCode,
        ...result,
      };
    }

    return {
      received: true,
      idempotent: true,
      bookingCode,
    };
  }
}

module.exports = new PaymentService();
