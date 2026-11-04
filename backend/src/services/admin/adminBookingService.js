const AppError = require('../../utils/AppError');
const {
  bookingRepo,
  motorRepo,
  paymentRepo,
  promoRepo,
  userRepo,
  documentRepo,
  handoverRepo,
  returnRepo,
  bookingNoteRepo,
  settingsRepo,
  gpsRepo,
  transaction,
} = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const { toCsv } = require('../../utils/csv');
const { calculateCancellationRefund } = require('../../config/rules');
const clock = require('../../utils/clock');
const { resolveBooking } = require('../../utils/bookingResolver');
const { bookingCapabilities } = require('../../utils/bookingCapabilities');
const eventBroadcaster = require('../realtime/eventBroadcaster');

const adminBookingService = {
  async getBookings(filter = {}, paging = {}) {
    const page = Math.max(1, Number(paging.page ?? filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(paging.limit ?? filter.limit) || 10));

    const [result, counts, motorsRes] = await Promise.all([
      bookingRepo.findAll(filter, { page, limit }),
      bookingRepo.countStatusSummary(filter),
      motorRepo.findAll({}, { limit: 1000 }),
    ]);

    const motorMap = new Map(motorsRes.items.map((m) => [String(m.id), m]));

    const enrichedItems = result.items.map((b) => {
      const motor = motorMap.get(String(b.motorId));
      return {
        ...b,
        capabilities: bookingCapabilities(b, null, { role: 'admin' }),
        motor: motor
          ? { id: motor.id, name: motor.name, plate: motor.plate || motor.licensePlate || '-' }
          : b.motor || null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(result.total / limit));

    return {
      items: enrichedItems,
      total: result.total,
      page,
      limit,
      totalPages,
      statusCounts: counts,
      meta: {
        total: result.total,
        page,
        limit,
        totalPages,
        statusCounts: counts,
      },
    };
  },

  async getBookingById(id, actor = { role: 'admin' }) {
    const booking = await resolveBooking(id);
    if (!booking) {
      throw new AppError('Transaksi booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
    }

    const [motor, handover, returnRecord, notes, userDocs, payment] = await Promise.all([
      motorRepo.findById(booking.motorId),
      handoverRepo.findByBookingId(booking.id),
      returnRepo.findByBookingId(booking.id),
      bookingNoteRepo.findByBookingId(booking.id),
      documentRepo.findByUserId(booking.userId),
      paymentRepo.findByBookingId(booking.id),
    ]);

    // Status dokumen penyewa
    const ktpDoc = userDocs.find((d) => d.type === 'ktp');
    const simDoc = userDocs.find((d) => d.type === 'sim');
    const isDocVerified = ktpDoc?.status === 'verified' && simDoc?.status === 'verified';
    const capabilities = bookingCapabilities(booking, payment, actor);

    // Ringkasan lokasi GPS motor terkini (khusus staff & admin)
    let gpsLocation = null;
    try {
      const gpsDevice = await gpsRepo.findDeviceByMotorcycleId(booking.motorId);
      if (gpsDevice) {
        const settings = await settingsRepo.getSettings();
        const offlineMinutes = Number(settings['gps.offline_minutes'] || 15);
        const now = Date.now();
        const lastSeen = gpsDevice.lastSeenAt ? new Date(gpsDevice.lastSeenAt).getTime() : 0;
        const isOnline = Boolean(gpsDevice.isActive && (now - lastSeen <= offlineMinutes * 60 * 1000));

        gpsLocation = {
          deviceId: gpsDevice.id,
          externalId: gpsDevice.externalId,
          label: gpsDevice.label,
          status: isOnline ? 'online' : 'offline',
          isOnline,
          lat: gpsDevice.lastLat,
          lng: gpsDevice.lastLng,
          speedKmh: gpsDevice.lastSpeedKmh || 0,
          heading: gpsDevice.lastHeading || 0,
          ignition: Boolean(gpsDevice.lastIgnition),
          batteryPct: gpsDevice.lastBatteryPct !== null ? gpsDevice.lastBatteryPct : gpsDevice.batteryPct,
          lastRecordedAt: gpsDevice.lastRecordedAt,
          lastSeenAt: gpsDevice.lastSeenAt,
        };
      }
    } catch {
      // ignore
    }

    return {
      ...booking,
      capabilities,
      motor: motor
        ? { id: motor.id, name: motor.name, plate: motor.plate || motor.licensePlate || '-', brand: motor.brand, images: motor.images }
        : booking.motor || null,
      handover: handover || booking.handover || null,
      returnInfo: returnRecord || booking.returnInfo || null,
      notesList: notes,
      documentsVerified: isDocVerified,
      documentDetails: {
        ktp: ktpDoc?.status || 'not_uploaded',
        sim: simDoc?.status || 'not_uploaded',
      },
      gpsLocation,
    };
  },

  async confirmManualPayment(bookingId, payload = {}, actor = {}, reqInfo = {}) {
    const actorUser = actor?.user || actor || {};
    return transaction(async (tx) => {
      let booking = await resolveBooking(bookingId, tx);
      if (!booking) {
        throw new AppError('Transaksi booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
      }

      if (tx.driver === 'postgres' && tx.client) {
        const locked = await tx.client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking.id]);
        if (locked.rows.length > 0) {
          booking = {
            ...booking,
            status: locked.rows[0].status,
            paidAt: locked.rows[0].paid_at || booking.paidAt,
            paymentStatus: locked.rows[0].paid_at ? 'paid' : booking.paymentStatus,
          };
        }
      }

      // Idempotent: jika sudah confirmed & paid, kembalikan data yang ada
      if (booking.status === 'confirmed' && (booking.paymentStatus === 'paid' || booking.paidAt)) {
        return booking;
      }

      // Optimistic Concurrency Check
      if (payload.version !== undefined && payload.version !== null && Number(payload.version) !== Number(booking.version || 1)) {
        throw new AppError('Data sudah berubah, halaman diperbarui.', 'STALE_DATA', 409, {
          currentVersion: Number(booking.version || 1),
        });
      }

      if (booking.status !== 'pending') {
        throw new AppError(
          `Hanya booking berstatus "pending" yang dapat dikonfirmasi pembayarannya. Status saat ini: "${booking.status}".`,
          'INVALID_STATUS_TRANSITION',
          409,
        );
      }

      if (booking.expiresAt) {
        const exp = new Date(booking.expiresAt);
        if (exp.getTime() < clock.now().getTime()) {
          throw new AppError('Booking telah kedaluwarsa dan tidak dapat dikonfirmasi pembayarannya.', 'BOOKING_EXPIRED', 409);
        }
      }

      const allowedMethods = ['bank_transfer', 'ewallet', 'qris', 'cash'];
      const rawMethod = String(payload.paymentMethod || 'cash').toLowerCase();
      const method = (rawMethod === 'transfer' || rawMethod === 'bank_transfer')
        ? 'bank_transfer'
        : (allowedMethods.includes(rawMethod) ? rawMethod : 'cash');
      const notes = payload.notes || 'Pembayaran dikonfirmasi manual oleh staf';
      const paidAt = clock.nowIso();

      const timeline = Array.isArray(booking.timeline) ? [...booking.timeline] : [];
      timeline.push({
        status: 'confirmed',
        title: 'Pembayaran Dikonfirmasi Manual',
        note: `${notes} (${method})`,
        actor: actor.name || 'Staff',
        timestamp: paidAt,
      });

      // Buat payment record jika paymentRepo tersedia
      if (tx.paymentRepo && typeof tx.paymentRepo.create === 'function') {
        const amount = Number(payload.amount) || Number(booking.grandTotal || booking.total || booking.totalPrice || 0);
        await tx.paymentRepo.create({
          bookingId: booking.id,
          userId: booking.userId,
          amount,
          method,
          status: 'paid',
          paidAt,
          gatewayRef: `MANUAL-${booking.code}-${Date.now()}`,
        });
      }

      const updated = await tx.bookingRepo.update(booking.id, {
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: method,
        paidAt,
        timeline,
        version: Number(booking.version || 1) + 1,
      });

      // Update otomatis status motor di PostgreSQL menjadi 'rented' saat pembayaran dikonfirmasi
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          "UPDATE motorcycles SET status = 'rented', updated_at = now() WHERE id = $1",
          [Number(booking.motorId)],
        );
      }

      // Catat log audit
      await recordAudit(tx.auditRepo, {
        actorId: actor.id,
        actorRole: actor.role,
        actorName: actor.name,
        action: 'CONFIRM_PAYMENT',
        entityType: 'Booking',
        entityId: booking.id,
        before: { status: booking.status, paymentStatus: booking.paymentStatus },
        after: { status: 'confirmed', paymentStatus: 'paid' },
        details: `Konfirmasi pembayaran manual booking #${booking.code} (${method})`,
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
      });

      // Realtime Outbox Events
      await eventBroadcaster.publish(tx, {
        type: 'payment.updated',
        entityId: String(booking.id),
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
        type: 'counters.changed',
        entityId: 'bookings',
        userId: null,
        payload: { action: 'confirm_manual_payment' },
      });

      return updated;
    });
  },

  async cancelBooking(bookingId, payload = {}, actor = {}, reqInfo = {}) {
    actor = actor?.user || actor || {};
    if (!payload.reason || !payload.reason.trim()) {
      throw new AppError('Alasan pembatalan wajib diisi.', 'VALIDATION_ERROR', 400);
    }

    return transaction(async (tx) => {
      let booking = await resolveBooking(bookingId, tx);
      if (!booking) {
        throw new AppError('Transaksi booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
      }

      if (tx.driver === 'postgres' && tx.client) {
        const locked = await tx.client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking.id]);
        if (locked.rows.length > 0) {
          booking = {
            ...booking,
            status: locked.rows[0].status,
          };
        }
      }

      if (!['pending', 'confirmed'].includes(booking.status)) {
        throw new AppError(
          `Booking berstatus "${booking.status}" tidak dapat dibatalkan.`,
          'INVALID_STATUS_TRANSITION',
          400,
        );
      }

      // Optimistic Concurrency Check
      if (payload.version !== undefined && payload.version !== null && Number(payload.version) !== Number(booking.version || 1)) {
        throw new AppError('Data sudah berubah, halaman diperbarui.', 'STALE_DATA', 409, {
          currentVersion: Number(booking.version || 1),
        });
      }

      const totalPaid = Number(booking.grandTotal || booking.total || 0);
      const isPaid = booking.status === 'confirmed' || Boolean(booking.paidAt);

      // Staff dilarang membatalkan booking berbayar (hanya admin)
      if (actor.role === 'staff' && isPaid) {
        throw new AppError('Hanya admin yang berhak membatalkan pemesanan berbayar.', 'FORBIDDEN_ROLE', 403);
      }

      let refundAmount = 0;
      if (booking.status === 'pending') {
        refundAmount = 0;
      } else {
        if (payload.refundAmount !== undefined && payload.refundAmount !== null) {
          const manualRefund = Number(payload.refundAmount);
          if (manualRefund < 0 || manualRefund > totalPaid) {
            throw new AppError(
              'Jumlah refund tidak boleh melebihi total yang dibayar.',
              'VALIDATION_ERROR',
              400,
            );
          }
          refundAmount = manualRefund;
        } else {
          refundAmount = totalPaid;
        }
      }

      // Lepas promo tepat sekali (hanya jika belum released)
      if (tx.driver === 'postgres' && tx.client) {
        const relRes = await tx.client.query(
          `UPDATE promo_redemptions
           SET released_at = now()
           WHERE booking_id = $1 AND released_at IS NULL
           RETURNING promo_id`,
          [booking.id],
        );
        if (relRes.rows.length > 0) {
          await tx.client.query(
            `UPDATE promo_codes
             SET used_count = GREATEST(0, used_count - 1), updated_at = now()
             WHERE id = $1`,
            [relRes.rows[0].promo_id],
          );
        }
      } else if (booking.promoCode && !booking.promoReleased) {
        booking.promoReleased = true;
        if (tx.promoRepo && typeof tx.promoRepo.incrementQuota === 'function') {
          await tx.promoRepo.incrementQuota(booking.promoCode);
        }
      }

      // Kunci baris payment FOR UPDATE:
      // - pending -> cancelled
      // - paid dengan refund > 0 -> refunded
      let finalPayment = null;
      if (tx.driver === 'postgres' && tx.client) {
        const pRes = await tx.client.query(
          'SELECT * FROM payments WHERE booking_id = $1 FOR UPDATE',
          [booking.id],
        );
        if (pRes.rows.length > 0) {
          const pay = pRes.rows[0];
          if (pay.status === 'pending') {
            await tx.client.query(
              `UPDATE payments SET status = 'cancelled', updated_at = now() WHERE id = $1`,
              [pay.id],
            );
          } else if (pay.status === 'paid' && refundAmount > 0) {
            await tx.client.query(
              `UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = $1`,
              [pay.id],
            );
          }
          finalPayment = pay;
        }
      } else {
        const pay = await tx.paymentRepo.findByBookingId(booking.id);
        if (pay) {
          if (pay.status === 'pending') {
            await tx.paymentRepo.update(pay.id, { status: 'cancelled' });
          } else if (pay.status === 'paid' && refundAmount > 0) {
            await tx.paymentRepo.update(pay.id, { status: 'refunded' });
          }
          finalPayment = pay;
        }
      }

      const timeline = Array.isArray(booking.timeline) ? [...booking.timeline] : [];
      timeline.push({
        status: 'cancelled',
        title: 'Booking Dibatalkan',
        note: `Alasan: ${payload.reason.trim()}${refundAmount > 0 ? ` | Refund: Rp ${refundAmount.toLocaleString('id-ID')}` : ''}`,
        actor: actor.name || 'Admin',
        timestamp: new Date().toISOString(),
      });

      const nextVersion = Number(booking.version || 1) + 1;
      const updated = await tx.bookingRepo.update(booking.id, {
        status: 'cancelled',
        cancelledBy: actor.role || 'admin',
        paymentStatus: refundAmount > 0 ? 'refunded' : booking.paymentStatus,
        cancelReason: payload.reason.trim(),
        refundAmount,
        version: nextVersion,
        cancelledAt: new Date().toISOString(),
        timeline,
      });

      // Otomatis kembalikan status motor menjadi 'active' (tersedia) jika tidak ada booking aktif lain
      if (tx.driver === 'postgres' && tx.client) {
        const remaining = await tx.client.query(
          `SELECT 1 FROM bookings
           WHERE motorcycle_id = $1
             AND status IN ('pending', 'confirmed', 'active')
             AND id <> $2
           LIMIT 1`,
          [Number(booking.motorId), Number(booking.id)],
        );
        if (remaining.rows.length === 0) {
          await tx.client.query(
            "UPDATE motorcycles SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'rented'",
            [Number(booking.motorId)],
          );
        }
      }

      await recordAudit(tx.auditRepo, {
        actorId: actor.id,
        actorRole: actor.role,
        actorName: actor.name,
        action: 'CANCEL_BOOKING',
        entityType: 'Booking',
        entityId: booking.id,
        before: { status: booking.status, version: booking.version },
        after: { status: 'cancelled', version: nextVersion, refundAmount, cancelledBy: actor.role },
        details: `Pembatalan booking #${booking.code}: ${payload.reason.trim()}`,
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
      });

      // Realtime Outbox Events: Admin Cancel
      await eventBroadcaster.publish(tx, {
        type: 'booking.updated',
        entityId: String(booking.id),
        userId: Number(booking.userId),
        version: nextVersion,
        payload: { id: booking.id, code: booking.code, status: 'cancelled' },
      });
      await eventBroadcaster.publish(tx, {
        type: 'payment.updated',
        entityId: String(finalPayment?.id || booking.id),
        userId: Number(booking.userId),
        version: nextVersion,
        payload: { bookingId: booking.id, status: refundAmount > 0 ? 'refunded' : 'cancelled' },
      });
      await eventBroadcaster.publish(tx, {
        type: 'motor.availability.changed',
        entityId: String(booking.motorId),
        userId: null,
        version: nextVersion,
        payload: { motorId: Number(booking.motorId) },
      });
      await eventBroadcaster.publish(tx, {
        type: 'counters.changed',
        entityId: 'bookings',
        userId: null,
        payload: { action: 'admin_cancel_booking' },
      });

      const capabilities = bookingCapabilities(updated, finalPayment, actor);
      return {
        ...updated,
        capabilities,
      };
    });
  },

  async addNote(bookingId, noteText, actor = {}, reqInfo = {}) {
    actor = actor?.user || actor || {};
    if (!noteText || !noteText.trim()) {
      throw new AppError('Catatan tidak boleh kosong.', 'VALIDATION_ERROR', 400);
    }
    if (noteText.trim().length > 1000) {
      throw new AppError('Catatan maksimal 1000 karakter.', 'VALIDATION_ERROR', 400);
    }

    const booking = await resolveBooking(bookingId);
    if (!booking) {
      throw new AppError('Transaksi booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
    }

    const note = await bookingNoteRepo.create({
      bookingId: booking.id,
      note: noteText.trim(),
      authorId: actor.id,
      authorName: actor.name || 'Staf',
      authorRole: actor.role || 'staff',
    });

    const timeline = Array.isArray(booking.timeline) ? [...booking.timeline] : [];
    timeline.push({
      status: booking.status,
      title: 'Catatan Internal Ditambahkan',
      note: noteText.trim(),
      actor: actor.name || 'Staf',
      timestamp: new Date().toISOString(),
    });

    const updated = await bookingRepo.update(booking.id, { timeline });

    return { note, booking: updated };
  },

  async markDepositRefunded(bookingId, actor = {}, reqInfo = {}) {
    actor = actor?.user || actor || {};
    return transaction(async (tx) => {
      const booking = await resolveBooking(bookingId, tx);
      if (!booking) {
        throw new AppError('Transaksi booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
      }

      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query('SELECT id FROM bookings WHERE id = $1 FOR UPDATE', [booking.id]);
      }

      if (booking.status !== 'completed') {
        throw new AppError(
          'Penandaan deposit hanya dapat dilakukan pada booking yang berstatus "completed".',
          'INVALID_STATUS_TRANSITION',
          409,
        );
      }

      if (booking.depositReturned) {
        throw new AppError('Deposit untuk booking ini telah ditandai dikembalikan sebelumnya.', 'VALIDATION_ERROR', 400);
      }

      if (tx.returnRepo && typeof tx.returnRepo.updateDepositRefundStatus === 'function') {
        const retRes = await tx.returnRepo.updateDepositRefundStatus(booking.id, {
          depositRefundedAt: new Date(),
          depositRefundedBy: actor.id,
        });
        if (!retRes && booking.depositRefund > 0) {
          throw new AppError('Deposit untuk booking ini telah ditandai dikembalikan sebelumnya.', 'VALIDATION_ERROR', 400);
        }
      }

      const updated = await tx.bookingRepo.update(booking.id, {
        depositReturned: true,
        depositRefundStatus: 'refunded',
        depositReturnedAt: new Date().toISOString(),
        depositReturnedBy: actor.name || 'Staf',
      });

      await recordAudit(tx.auditRepo, {
        actorId: actor.id,
        actorRole: actor.role,
        actorName: actor.name,
        action: 'REFUND_DEPOSIT',
        entityType: 'Booking',
        entityId: booking.id,
        details: `Penandaan pengembalian deposit untuk booking #${booking.code}`,
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
      });

      return updated;
    });
  },

  async exportBookingsCsv(filter = {}) {
    const items = typeof bookingRepo.findBatchForCsv === 'function'
      ? await bookingRepo.findBatchForCsv(filter, 1000, 50000)
      : (await bookingRepo.findAll(filter, { page: 1, limit: 50000 })).items;
    const motorsRes = await motorRepo.findAll({}, { limit: 1000 });
    const motorMap = new Map(motorsRes.items.map((m) => [String(m.id), m]));

    const columns = [
      { key: 'code', label: 'Kode Booking' },
      { key: (b) => b.renter?.name || '', label: 'Nama Penyewa' },
      { key: (b) => b.renter?.phone || '', label: 'Telepon Penyewa' },
      { key: (b) => motorMap.get(String(b.motorId))?.name || 'Motor', label: 'Unit Motor' },
      { key: (b) => motorMap.get(String(b.motorId))?.plate || '-', label: 'Plat Nomor' },
      { key: 'startDate', label: 'Tanggal Mulai' },
      { key: 'endDate', label: 'Tanggal Selesai' },
      { key: 'days', label: 'Durasi (Hari)' },
      { key: 'total', label: 'Total Biaya (IDR)' },
      { key: 'status', label: 'Status Sewa' },
      { key: 'paymentStatus', label: 'Status Pembayaran' },
      { key: 'paymentMethod', label: 'Metode Pembayaran' },
      { key: 'createdAt', label: 'Waktu Transaksi' },
    ];

    const csv = toCsv(items, columns);
    const filename = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    return { csv, filename };
  },
};

module.exports = adminBookingService;
