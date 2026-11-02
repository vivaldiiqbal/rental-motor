const AppError = require('../../utils/AppError');
const { transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const { todayWIB } = require('../../utils/dates');
const { resolveBooking } = require('../../utils/bookingResolver');
const eventBroadcaster = require('../realtime/eventBroadcaster');

const ALLOWED_FUEL = ['kosong', '1/4', '1/2', '3/4', 'penuh'];

const handoverService = {
  async handoverMotor(bookingId, payload = {}, actor = {}, reqInfo = {}) {
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

      // 1. Cek pembayaran lunas
      if (booking.paymentStatus !== 'paid') {
        throw new AppError(
          'Pembayaran sewa belum lunas! Mohon konfirmasi pembayaran terlebih dahulu sebelum serah terima unit.',
          'PAYMENT_NOT_PAID',
          400,
        );
      }

      if (booking.status !== 'confirmed') {
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

      // 3. Validasi tanggal hari ini (WIB) >= start_date dan < end_date
      const todayStr = todayWIB();
      if (todayStr < booking.startDate || todayStr >= booking.endDate) {
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

      const fuelStart = (payload.fuelStart || payload.initialFuel || 'penuh').toLowerCase();
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

      // 6. Simpan record handover
      const handoverRecord = await tx.handoverRepo.create({
        bookingId: booking.id,
        startOdometer: odometerStart,
        initialFuel: fuelStart,
        conditionNotes: payload.conditionNotes || 'Unit dalam kondisi baik',
        originalDocsChecked: true,
        depositReceived: true,
        photos: Array.isArray(payload.photos) ? payload.photos : [],
        handedBy: actor.name || 'Staf',
        handedAt,
      });

      // 7. Update status motor ke active sewa dan update odometer motor
      if (motor) {
        await tx.motorRepo.update(motor.id, {
          odometer: odometerStart,
        });
      }

      // 8. Update status booking ke active
      const timeline = Array.isArray(booking.timeline) ? [...booking.timeline] : [];
      timeline.push({
        status: 'active',
        title: 'Unit Motor Diserah-terimakan',
        note: `Odo: ${odometerStart} km | BBM: ${fuelStart} | Catatan: ${payload.conditionNotes || 'Baik'}`,
        actor: actor.name || 'Staf',
        timestamp: handedAt,
      });

      const updatedBooking = await tx.bookingRepo.update(booking.id, {
        status: 'active',
        startOdometer: odometerStart,
        initialFuel: fuelStart,
        handedAt,
        handover: handoverRecord,
        timeline,
      });

      // 9. Catat log audit
      await recordAudit(tx.auditRepo, {
        actorId: actor.id,
        actorRole: actor.role,
        actorName: actor.name,
        action: 'HANDOVER_MOTOR',
        entityType: 'Booking',
        entityId: booking.id,
        before: { status: 'confirmed' },
        after: { status: 'active', startOdometer: odometerStart, fuelStart },
        details: `Serah terima unit booking #${booking.code} (Odo: ${odometerStart} km, BBM: ${fuelStart})`,
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
      });

      // Realtime Outbox Events: Serah Terima Unit
      await eventBroadcaster.publish(tx, {
        type: 'booking.updated',
        entityId: String(booking.id),
        userId: Number(booking.userId),
        payload: { id: booking.id, code: booking.code, status: 'active' },
      });
      await eventBroadcaster.publish(tx, {
        type: 'counters.changed',
        entityId: 'bookings',
        userId: null,
        payload: { action: 'handover_completed' },
      });

      return {
        booking: updatedBooking,
        handover: handoverRecord,
      };
    });
  },
};

module.exports = handoverService;
