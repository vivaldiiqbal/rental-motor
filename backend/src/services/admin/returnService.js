const AppError = require('../../utils/AppError');
const { transaction, settingsRepo } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const clock = require('../../utils/clock');
const { resolveBooking } = require('../../utils/bookingResolver');
const eventBroadcaster = require('../realtime/eventBroadcaster');

const ALLOWED_FUEL = ['empty', 'quarter', 'half', 'three_quarter', 'full', 'kosong', '1/4', '1/2', '3/4', 'penuh'];

/**
 * Menormalkan input level BBM bebas (mis. "Penuh (F)", "Setengah") ke nilai yang
 * diterima CHECK chk_returns_fuel_end. Input kosong/tidak dikenal dianggap 'penuh'.
 */
function normalizeFuel(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (!v) return 'penuh';
  if (ALLOWED_FUEL.includes(v)) return v;
  if (v.includes('3/4') || v.includes('tiga')) return '3/4';
  if (v.includes('1/2') || v.includes('setengah') || v.includes('half')) return '1/2';
  if (v.includes('1/4') || v.includes('seperempat') || v.includes('quarter')) return '1/4';
  if (v.includes('kosong') || v.includes('empty') || v.includes('(e)')) return 'kosong';
  return 'penuh';
}

const returnService = {
  async calculateReturnSummary(booking, returnedAtStr, damageFee = 0, otherFee = 0) {
    const snapshot = booking.policySnapshot || {};
    let toleranceMinutes = snapshot.lateFeeToleranceMinutes;
    let lateFeePercent = snapshot.lateFeePercentPerHour;

    if (toleranceMinutes === undefined || lateFeePercent === undefined) {
      const settings = await settingsRepo.getSettings();
      if (toleranceMinutes === undefined) toleranceMinutes = settings.lateFeeToleranceMinutes ?? 120;
      if (lateFeePercent === undefined) lateFeePercent = settings.lateFeePercentPerHour ?? 10;
    }

    const pickupTime = booking.pickupTime || '09:00';
    const handedAt =
      booking.handoverAt ||
      booking.handedAt ||
      booking.handover?.handedOverAt ||
      booking.handover?.handedAt ||
      null;
    const totalDays = Math.max(
      1,
      Number(booking.totalDays || booking.days || 0) ||
        Math.round((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / (1000 * 60 * 60 * 24)),
    );
    const scheduled = handedAt
      ? new Date(new Date(handedAt).getTime() + totalDays * 24 * 60 * 60 * 1000)
      : new Date(`${booking.endDate}T${pickupTime}:00+07:00`);
    const returnedAt = new Date(returnedAtStr);

    const diffMs = returnedAt.getTime() - scheduled.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    let lateMinutes = Math.max(0, diffMinutes);
    let lateHours = 0;
    let lateFee = 0;
    let isOverdue = false;

    const dailyPrice = Number(booking.pricePerDay || booking.dailyPrice || (booking.subtotal / (booking.days || 1))) || 100000;
    const hourlyFee = Math.round(dailyPrice * (lateFeePercent / 100));

    if (lateMinutes > toleranceMinutes) {
      isOverdue = true;
      lateHours = Math.ceil(lateMinutes / 60);

      // Hitung per blok 24 jam: denda per blok 24 jam tidak boleh melebihi dailyPrice
      const fullDays = Math.floor(lateHours / 24);
      const remainingHours = lateHours % 24;
      const remainingFee = Math.min(dailyPrice, remainingHours * hourlyFee);

      lateFee = Math.round(fullDays * dailyPrice + remainingFee);
    }

    // Deposit diambil langsung dari data asli booking (bukan hardcoded)
    const rawDeposit = Number(booking.deposit !== undefined ? booking.deposit : (booking.deposit_snapshot !== undefined ? booking.deposit_snapshot : 200000));
    const deposit = Number.isFinite(rawDeposit) && rawDeposit >= 0 ? Math.round(rawDeposit) : 200000;
    const dFee = Math.max(0, Math.floor(Number(damageFee) || 0));
    const oFee = Math.max(0, Math.floor(Number(otherFee) || 0));

    const totalDeduction = lateFee + dFee + oFee;
    const depositRefund = Math.max(0, deposit - totalDeduction);
    const amountDue = Math.max(0, totalDeduction - deposit);

    return {
      scheduledReturn: scheduled.toISOString(),
      actualReturn: returnedAt.toISOString(),
      diffMinutes,
      lateMinutes,
      lateHours,
      hourlyFee,
      isOverdue,
      lateFee,
      damageFee: dFee,
      otherFee: oFee,
      totalDeduction,
      deposit,
      depositRefund,
      amountDue,
    };
  },

  /**
   * Pratinjau pengembalian "saat ini" (read-only) untuk modal konfirmasi admin.
   * Menggunakan rumus yang sama persis dengan returnMotor sehingga angka di layar
   * selalu sama dengan yang dicatat saat konfirmasi.
   */
  async previewReturn(bookingId) {
    const { bookingRepo } = require('../../repositories');
    const booking = await resolveBooking(bookingId, { bookingRepo });
    if (!booking) {
      throw new AppError('Transaksi booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
    }
    if (booking.status !== 'active' && booking.status !== 'return_requested') {
      throw new AppError(
        'Pratinjau pengembalian hanya tersedia untuk sewa yang sedang berjalan.',
        'INVALID_STATUS_TRANSITION',
        409,
      );
    }
    const summary = await this.calculateReturnSummary(booking, clock.nowIso());
    const addons = (booking.selectedAddOns || booking.addonsList || booking.addons || []).map((a) => ({
      name: a.name || a.label || 'Perlengkapan',
      quantity: Number(a.quantity || a.qty || 1),
    }));
    return { ...summary, addons, pricePerDay: Number(booking.pricePerDay) || 0 };
  },

  async returnMotor(bookingId, payload = {}, actor = {}, reqInfo = {}) {
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
          };
        }
      }

      if (tx.driver === 'postgres' && tx.client && booking.motorId) {
        await tx.client.query('SELECT id FROM motorcycles WHERE id = $1 FOR UPDATE', [Number(booking.motorId)]);
      }

      if (!['active', 'return_requested', 'confirmed'].includes(booking.status)) {
        throw new AppError(
          `Pengembalian motor hanya dapat dilakukan untuk booking yang berstatus "active", "return_requested", atau "confirmed". Status saat ini: "${booking.status}".`,
          'INVALID_STATUS_TRANSITION',
          400,
        );
      }

      // Cek pengulangan return record
      const existingReturn = await tx.returnRepo.findByBookingId(booking.id);
      if (existingReturn) {
        throw new AppError('Pengembalian motor telah dicatat sebelumnya.', 'INVALID_STATUS_TRANSITION', 400);
      }

      // Waktu kembali (default sekarang, tidak boleh sebelum serah terima atau di masa depan)
      const now = clock.now();
      let returnedAt = now;
      const rawReturnedAt = payload.returnedAt || payload.returnTime;
      if (rawReturnedAt) {
        const parsed = new Date(rawReturnedAt);
        if (isNaN(parsed.getTime())) {
          throw new AppError('Format tanggal waktu kembali tidak valid.', 'VALIDATION_ERROR', 400);
        }
        if (parsed > new Date(now.getTime() + 5 * 60 * 1000)) {
          throw new AppError('Waktu pengembalian tidak boleh berada di masa depan.', 'VALIDATION_ERROR', 400);
        }
        returnedAt = parsed;
      }
      // Pengembalian bebas kapan saja (bahkan 1 menit setelah serah terima atau masih sisa 23 jam)
      const handedRef = booking.handoverAt || booking.handedAt;
      if (handedRef && returnedAt < new Date(handedRef)) {
        returnedAt = new Date(handedRef);
      }

      // Odometer akhir otomatis aman (default ke odometer awal jika kosong/lebih kecil)
      const motorBefore = await tx.motorRepo.findById(booking.motorId);
      const startOdo = Number(booking.startOdometer || (motorBefore ? (motorBefore.odometer || motorBefore.odometerKm) : 0) || 0);
      let odometerEnd = Number(payload.odometerEnd !== undefined ? payload.odometerEnd : payload.endOdometer);
      if (isNaN(odometerEnd) || odometerEnd < startOdo) {
        odometerEnd = startOdo;
      }

      const damageFee = Math.max(0, Math.floor(Number(payload.damageFee) || 0));
      const otherFee = Math.max(0, Math.floor(Number(payload.otherFee) || 0));
      const notes = payload.notes || 'Unit diterima kembali dan sewa selesai';
      const fuelEnd = normalizeFuel(payload.fuelEnd || payload.finalFuel);

      // Hitung ringkasan denda dan deposit
      const summary = await this.calculateReturnSummary(
        booking,
        returnedAt.toISOString(),
        damageFee,
        otherFee,
      );

      // 1. Simpan return record unik (deposit refund otomatis terkonfirmasi)
      const shouldConfirmDepositRefund = payload.confirmDepositRefund !== false && summary.depositRefund > 0;
      const returnRecord = await tx.returnRepo.create({
        bookingId: booking.id,
        returnedAt: summary.actualReturn,
        odometerEnd,
        fuelEnd,
        notes,
        lateMinutes: summary.lateMinutes,
        lateHours: summary.lateHours,
        lateFee: summary.lateFee,
        damageFee: summary.damageFee,
        otherFee: summary.otherFee,
        totalDeduction: summary.totalDeduction,
        // Snapshot deposit WAJIB sama dengan deposit booking agar konsisten dengan
        // CHECK chk_returns_consistency_refund / chk_returns_consistency_amount_due.
        depositSnapshot: summary.deposit,
        depositRefund: summary.depositRefund,
        amountDue: summary.amountDue,
        depositRefundedAt: shouldConfirmDepositRefund ? summary.actualReturn : null,
        depositRefundedBy: shouldConfirmDepositRefund ? (actorUser.id || null) : null,
        receivedBy: actorUser.name || 'Staf',
        receivedById: actorUser.id,
      });

      // 2. Update motor (odometer, rental_count + 1, dan status ketersediaan)
      const motor = await tx.motorRepo.findById(booking.motorId);
      if (motor) {
        let nextMotorStatus = motor.status === 'inactive' ? 'inactive' : 'available';
        if (tx.driver === 'postgres' && tx.client) {
          const remainingRes = await tx.client.query(
            `SELECT 1 FROM bookings
             WHERE motorcycle_id = $1
               AND (status = 'active' OR (status IN ('confirmed', 'pending') AND end_date >= CURRENT_DATE))
               AND id <> $2
             LIMIT 1`,
            [Number(booking.motorId), Number(booking.id)],
          );
          if (remainingRes.rows.length > 0) {
            nextMotorStatus = 'rented';
          } else {
            nextMotorStatus = 'available';
            await tx.client.query(
              "UPDATE motorcycles SET status = 'active', updated_at = now() WHERE id = $1",
              [Number(booking.motorId)],
            );
          }
        }
        await tx.motorRepo.update(motor.id, {
          odometer: odometerEnd,
          rentalCount: (Number(motor.rentalCount) || 0) + 1,
          status: nextMotorStatus,
        });
      }

      // 3. Update booking status ke completed
      const timeline = Array.isArray(booking.timeline) ? [...booking.timeline] : [];
      timeline.push({
        status: 'completed',
        title: 'Unit Motor Dikembalikan',
        note: `Odo akhir: ${odometerEnd} km | BBM: ${fuelEnd} | Denda: Rp ${summary.lateFee.toLocaleString('id-ID')}${summary.damageFee > 0 ? ` | Kerusakan: Rp ${summary.damageFee.toLocaleString('id-ID')}` : ''}${summary.amountDue > 0 ? ` | Kurang Bayar: Rp ${summary.amountDue.toLocaleString('id-ID')}` : ` | Deposit Kembali: Rp ${summary.depositRefund.toLocaleString('id-ID')}${shouldConfirmDepositRefund ? ' (Telah Dikembalikan)' : ''}`}`,
        actor: actorUser.name || 'Staf',
        timestamp: summary.actualReturn,
      });

      const updatedBooking = await tx.bookingRepo.update(booking.id, {
        status: 'completed',
        endOdometer: odometerEnd,
        finalFuel: fuelEnd,
        actualReturnDate: summary.actualReturn,
        lateFee: summary.lateFee,
        damageFee: summary.damageFee,
        otherFee: summary.otherFee,
        depositRefund: summary.depositRefund,
        amountDue: summary.amountDue,
        depositReturned: shouldConfirmDepositRefund,
        depositRefundStatus: shouldConfirmDepositRefund ? 'refunded' : 'pending',
        returnInfo: returnRecord,
        timeline,
        version: Number(booking.version || 1) + 1,
      });

      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          "UPDATE bookings SET status = 'completed', updated_at = now() WHERE id = $1",
          [Number(booking.id)],
        );
      }

      // 4. Catat log audit
      await recordAudit(tx.auditRepo, {
        actorId: actorUser.id,
        actorRole: actorUser.role,
        actorName: actorUser.name,
        action: 'RETURN_MOTOR',
        entityType: 'Booking',
        entityId: booking.id,
        before: { status: booking.status },
        after: {
          status: 'completed',
          endOdometer: odometerEnd,
          lateFee: summary.lateFee,
          damageFee: summary.damageFee,
          amountDue: summary.amountDue,
          depositRefund: summary.depositRefund,
          depositReturned: shouldConfirmDepositRefund,
        },
        details: `Pengembalian motor booking #${booking.code} (Denda: Rp ${summary.lateFee}, Kurang Bayar: Rp ${summary.amountDue})`,
        ip: clientIp,
        userAgent,
      });

      // Realtime Outbox Events: Pengembalian Unit Motor
      await eventBroadcaster.publish(tx, {
        type: 'booking.updated',
        entityId: String(booking.id),
        userId: Number(booking.userId),
        payload: { id: booking.id, code: booking.code, status: 'completed' },
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
        payload: { action: 'return_completed' },
      });

      return {
        booking: updatedBooking,
        returnInfo: returnRecord,
        summary,
      };
    });
  },
};

module.exports = returnService;
