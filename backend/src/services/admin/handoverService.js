const AppError = require('../../utils/AppError');
const { transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const { todayWIB } = require('../../utils/dates');
const { resolveBooking } = require('../../utils/bookingResolver');
const eventBroadcaster = require('../realtime/eventBroadcaster');

const ALLOWED_FUEL = ['kosong', '1/4', '1/2', '3/4', 'penuh'];

const handoverService = {
  async handoverMotor(bookingId, payload = {}, actor = {}, reqInfo = {}) {
    const actorUser = actor.user || actor || {};
    const clientIp = reqInfo.ip || actor.ip || null;
    const userAgent = reqInfo.userAgent || actor.headers?.['user-agent'] || null;
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

      // 1. Cek pembayaran lunas (atau otomatis konfirmasi tunai bila confirmCashPayment=true)
      const isCashPendingAllowed =
        Boolean(payload.confirmCashPayment) &&
        (booking.paymentMethod === 'cash' || booking.payment === 'cash') &&
        (booking.status === 'pending' || booking.status === 'confirmed');

      if (booking.paymentStatus !== 'paid' && !isCashPendingAllowed) {
        throw new AppError(
          'Pembayaran sewa belum lunas! Mohon konfirmasi pembayaran terlebih dahulu sebelum serah terima unit.',
          'PAYMENT_NOT_PAID',
          400,
        );
      }

      if (booking.status !== 'confirmed' && !isCashPendingAllowed) {
        throw new AppError(
          `Serah terima hanya dapat dilakukan untuk booking berstatus "confirmed". Status saat ini: "${booking.status}".`,
          'INVALID_STATUS_TRANSITION',
          400,
        );
      }

      // 2. Cek verifikasi dokumen penyewa (KTP dan SIM C)
      const userDocs = await tx.documentRepo.findByUserId(booking.userId);
      const ktpDoc = userDocs.find((d) => d.type === 'ktp');
      const simDoc = userDocs.find((d) => d.type === 'sim');

      if (ktpDoc?.status !== 'verified' || simDoc?.status !== 'verified') {
        const pendingReasons = [];
        if (ktpDoc?.status !== 'verified') pendingReasons.push(`KTP (${ktpDoc?.status || 'belum diunggah'})`);
        if (simDoc?.status !== 'verified') pendingReasons.push(`SIM C (${simDoc?.status || 'belum diunggah'})`);
        throw new AppError(
          `Dokumen identitas penyewa belum terverifikasi: ${pendingReasons.join(', ')}. Harap selesaikan verifikasi dokumen terlebih dahulu.`,
          'DOCS_NOT_VERIFIED',
          400,
        );
      }

      // 3. Validasi tanggal hari ini (WIB) >= start_date dan < end_date (kecuali forceHandover=true)
      const todayStr = todayWIB();
      if (!payload.forceHandover && (todayStr < booking.startDate || todayStr >= booking.endDate)) {
        throw new AppError(
          `Serah terima hanya dapat dilakukan pada rentang sewa (${booking.startDate} s/d ${booking.endDate}). Hari ini: ${todayStr}.`,
          'INVALID_DATE_RANGE',
          400,
        );
      }

      // 4. Validasi input formulir
      const originalDocsChecked = Boolean(payload.originalDocsChecked || payload.isIdentityVerified);
      const depositReceived = Boolean(payload.depositReceived || payload.isDepositReceived);

      if (!originalDocsChecked || !depositReceived) {
        throw new AppError(
          'Pemeriksaan fisik dokumen asli KTP/SIM dan penerimaan uang deposit wajib dikonfirmasi.',
          'VALIDATION_ERROR',
          400,
        );
      }

      const odometerStart = Number(payload.odometerStart !== undefined ? payload.odometerStart : payload.startOdometer);
      if (isNaN(odometerStart) || odometerStart < 0) {
        throw new AppError('Nilai odometer awal harus berupa angka non-negatif.', 'VALIDATION_ERROR', 400);
      }

      const motor = await tx.motorRepo.findById(booking.motorId);
      if (motor && typeof motor.odometer === 'number' && odometerStart < motor.odometer) {
        throw new AppError(
          `Odometer awal (${odometerStart} km) tidak boleh lebih kecil dari odometer tercatat motor (${motor.odometer} km).`,
          'VALIDATION_ERROR',
          400,
        );
      }

      const rawFuel = String(payload.fuelStart || payload.initialFuel || 'penuh').toLowerCase().trim();
      const fuelStart = rawFuel.includes('penuh') || rawFuel.includes('full')
        ? 'penuh'
        : rawFuel.includes('kosong') || rawFuel.includes('empty')
        ? 'kosong'
        : rawFuel;
      if (!ALLOWED_FUEL.includes(fuelStart)) {
        throw new AppError(
          `Level bensin awal tidak valid. Pilihan: ${ALLOWED_FUEL.join(', ')}.`,
          'VALIDATION_ERROR',
          400,
        );
      }

      // 5. Cek apakah sudah pernah handover
      const existingHandover = await tx.handoverRepo.findByBookingId(booking.id);
      if (existingHandover) {
        throw new AppError('Unit motor telah diserah-terimakan sebelumnya.', 'INVALID_STATUS_TRANSITION', 400);
      }

      const handedAt = new Date().toISOString();
      const totalDays = Math.max(
        1,
        Number(booking.totalDays || booking.days || 0) ||
          Math.round((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / (1000 * 60 * 60 * 24)),
      );
      const dueAt = new Date(new Date(handedAt).getTime() + totalDays * 24 * 60 * 60 * 1000).toISOString();

      // Bila booking masih pending (tunai), tandai lunas & confirmed terlebih dahulu
      if (booking.status === 'pending') {
        await tx.bookingRepo.update(booking.id, {
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentMethod: booking.paymentMethod || 'cash',
          paidAt: handedAt,
        });
      }

      // 6. Simpan record handover
      const handoverRecord = await tx.handoverRepo.create({
        bookingId: booking.id,
        startOdometer: odometerStart,
        initialFuel: fuelStart,
        conditionNotes: payload.conditionNotes || payload.notes || 'Unit dalam kondisi baik',
        originalDocsChecked: true,
        depositReceived: true,
        photos: Array.isArray(payload.photos) ? payload.photos : [],
        handedBy: actorUser.name || 'Staf',
        handedById: actorUser.id,
        handedAt,
      });

      // 7. Update status motor ke rented dan update odometer motor
      if (motor) {
        await tx.motorRepo.update(motor.id, {
          odometer: odometerStart,
          status: 'rented',
        });
        if (tx.driver === 'postgres' && tx.client) {
          await tx.client.query(
            "UPDATE motorcycles SET status = 'rented', updated_at = now() WHERE id = $1",
            [Number(motor.id)],
          );
        }
      }

      // 8. Update status booking ke active dan simpan handover_at
      const timeline = Array.isArray(booking.timeline) ? [...booking.timeline] : [];
      timeline.push({
        status: 'active',
        title: 'Unit Motor Diserah-terimakan',
        note: `Odo: ${odometerStart} km | BBM: ${fuelStart} | Catatan: ${payload.conditionNotes || payload.notes || 'Baik'} | Batas kembali (${totalDays}x24 jam): ${new Date(dueAt).toLocaleString('id-ID')}`,
        actor: actorUser.name || 'Staf',
        timestamp: handedAt,
      });

      const updatedBooking = await tx.bookingRepo.update(booking.id, {
        status: 'active',
        startOdometer: odometerStart,
        initialFuel: fuelStart,
        handedAt,
        handoverAt: handedAt,
        paymentStatus: 'paid',
        handover: handoverRecord,
        timeline,
        version: Number(booking.version || 1) + 1,
      });

      // 9. Catat log audit
      await recordAudit(tx.auditRepo, {
        actorId: actorUser.id,
        actorRole: actorUser.role,
        actorName: actorUser.name,
        action: 'HANDOVER_MOTOR',
        entityType: 'Booking',
        entityId: booking.id,
        before: { status: booking.status },
        after: { status: 'active', startOdometer: odometerStart, fuelStart, handedAt, dueAt },
        details: `Serah terima unit booking #${booking.code} (Odo: ${odometerStart} km, BBM: ${fuelStart})`,
        ip: clientIp,
        userAgent,
      });

      // Realtime Outbox Events: Serah Terima Unit
      await eventBroadcaster.publish(tx, {
        type: 'booking.updated',
        entityId: String(booking.id),
        userId: Number(booking.userId),
        payload: { id: booking.id, code: booking.code, status: 'active', handedAt, dueAt },
      });
      await eventBroadcaster.publish(tx, {
        type: 'motor.availability.changed',
        entityId: String(booking.motorId),
        userId: null,
        payload: { motorId: Number(booking.motorId) },
      });
      await eventBroadcaster.publish(tx, {
        type: 'counters.changed',
        entityId: 'bookings',
        userId: null,
        payload: { action: 'handover_completed' },
      });

      return {
        booking: {
          ...updatedBooking,
          handedAt,
          handoverAt: handedAt,
          dueAt,
        },
        handover: handoverRecord,
      };
    });
  },
};

module.exports = handoverService;
