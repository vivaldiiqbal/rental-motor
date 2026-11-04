const crypto = require('crypto');
const clock = require('../utils/clock');
const { transaction, bookingRepo, motorRepo, userRepo, promoRepo, paymentRepo, store } = require('../repositories');
const pricingService = require('./pricingService');
const promoService = require('./promoService');
const availabilityService = require('./availabilityService');
const settingsService = require('./admin/settingsService');
const contentService = require('./contentService');
const renterProfileService = require('./renterProfileService');
const { bookingCapabilities } = require('../utils/bookingCapabilities');
const eventBroadcaster = require('./realtime/eventBroadcaster');
const { RENTAL_RULES, isValidStatusTransition, calculateCancellationRefund } = require('../config/rules');
const { BOOKING_STATUS, MOTOR_STATUS } = require('../config/constants');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const {
  isValidISODate,
  parseDate,
  countDays,
  isDateInPast,
  getDaysFromToday,
  getHoursUntil,
  isOverlapping,
} = require('../utils/dates');
const { generateBookingCode } = require('../utils/code');
const { sanitizeMotor } = require('../utils/sanitize');
const { generateBookingICS } = require('../utils/ics');

/**
 * Membangun atau melengkapi timeline riwayat booking.
 */
function buildTimeline(booking) {
  if (Array.isArray(booking.timeline) && booking.timeline.length > 0) {
    return booking.timeline.map((item) => ({
      status: item.status,
      title: getTimelineTitle(item.status),
      description: item.note || item.description || '',
      timestamp: item.at || item.timestamp,
    }));
  }

  const list = [
    {
      status: BOOKING_STATUS.PENDING,
      title: 'Pemesanan Dibuat',
      description: 'Menunggu proses pembayaran dari pelanggan.',
      timestamp: booking.createdAt,
    },
  ];

  if (booking.paidAt) {
    list.push({
      status: BOOKING_STATUS.CONFIRMED,
      title: 'Pembayaran Terkonfirmasi',
      description: 'Pembayaran berhasil diverifikasi. Motor siap disiapkan.',
      timestamp: booking.paidAt,
    });
  }

  if (booking.status === BOOKING_STATUS.ACTIVE || booking.status === BOOKING_STATUS.COMPLETED) {
    list.push({
      status: BOOKING_STATUS.ACTIVE,
      title: 'Sewa Berjalan',
      description: 'Motor telah diserahkan dan masa sewa sedang berjalan.',
      timestamp: booking.startedAt || `${booking.startDate}T08:00:00.000Z`,
    });
  }

  if (booking.completedAt || booking.status === BOOKING_STATUS.COMPLETED) {
    list.push({
      status: BOOKING_STATUS.COMPLETED,
      title: 'Sewa Selesai',
      description: 'Motor telah dikembalikan dalam kondisi baik. Terima kasih!',
      timestamp: booking.completedAt || `${booking.endDate}T17:00:00.000Z`,
    });
  }

  if (booking.cancelledAt || booking.status === BOOKING_STATUS.CANCELLED) {
    list.push({
      status: BOOKING_STATUS.CANCELLED,
      title: 'Pemesanan Dibatalkan',
      description: booking.cancellationReason || 'Pemesanan sewa telah dibatalkan.',
      timestamp: booking.cancelledAt || booking.updatedAt || new Date().toISOString(),
    });
  }

  if (booking.status === BOOKING_STATUS.EXPIRED) {
    list.push({
      status: BOOKING_STATUS.EXPIRED,
      title: 'Pemesanan Kedaluwarsa',
      description: 'Pemesanan kedaluwarsa karena batas waktu pembayaran telah habis.',
      timestamp: booking.expiredAt || booking.updatedAt || new Date().toISOString(),
    });
  }

  return list;
}

function getTimelineTitle(status) {
  switch (status) {
    case BOOKING_STATUS.PENDING:
      return 'Pemesanan Dibuat';
    case BOOKING_STATUS.CONFIRMED:
      return 'Pembayaran Terkonfirmasi';
    case BOOKING_STATUS.ACTIVE:
      return 'Sewa Berjalan (Serah Terima Kunci)';
    case BOOKING_STATUS.RETURN_REQUESTED:
      return 'Pengembalian Diajukan Pelanggan';
    case BOOKING_STATUS.COMPLETED:
      return 'Sewa Selesai';
    case BOOKING_STATUS.CANCELLED:
      return 'Pemesanan Dibatalkan';
    case BOOKING_STATUS.EXPIRED:
      return 'Pemesanan Kedaluwarsa';
    default:
      return 'Pembaruan Status';
  }
}

class BookingService {
  /**
   * Menghitung penawaran rincian harga sewa tanpa menyimpan ke database.
   */
  async getQuote({ motorId, start, end, addons = [], delivery = {}, promoCode }) {
    const motor = await motorRepo.findById(motorId);
    if (!motor) {
      throw new AppError('Motor tidak ditemukan.', 'NOT_FOUND', 404);
    }

    if (!isValidISODate(start) || !isValidISODate(end)) {
      throw new AppError('Format tanggal sewa harus YYYY-MM-DD dan merupakan tanggal kalender yang valid.', 'INVALID_DATE_RANGE', 400);
    }

    const s = parseDate(start);
    const e = parseDate(end);
    if (!s || !e || e <= s) {
      throw new AppError('Tanggal kembali harus setelah tanggal ambil sewa.', 'INVALID_DATE_RANGE', 400);
    }

    if (isDateInPast(start)) {
      throw new AppError('Tanggal mulai sewa tidak boleh sebelum hari ini.', 'INVALID_DATE_RANGE', 400);
    }

    const daysFromToday = getDaysFromToday(start);
    if (daysFromToday > RENTAL_RULES.maxAdvanceDays) {
      throw new AppError(`Pemesanan sewa maksimal dapat dilakukan hingga ${RENTAL_RULES.maxAdvanceDays} hari ke depan.`, 'INVALID_DATE_RANGE', 400);
    }

    let minDays = RENTAL_RULES.minDays;
    let maxDays = RENTAL_RULES.maxDays;
    try {
      const settings = await settingsService.getSettings();
      if (settings?.minRentalDays) minDays = settings.minRentalDays;
      if (settings?.maxRentalDays) maxDays = settings.maxRentalDays;
    } catch (e) {
      // fallback jika db kosong
    }

    const days = countDays(start, end);
    if (days < minDays || days > maxDays) {
      throw new AppError(
        `Durasi sewa harus antara ${minDays} s/d ${maxDays} hari.`,
        'DURATION_OUT_OF_RANGE',
        400,
      );
    }

    let discount = 0;
    let promoDetails = null;
    if (promoCode) {
      const prelim = motor.pricePerDay * days;
      const res = await promoService.validatePromo({
        code: promoCode,
        subtotal: prelim,
        days,
        startDate: start,
        endDate: end,
      });
      discount = res.discount;
      promoDetails = res.promo;
    }

    const pricing = await pricingService.calculatePriceAsync({
      pricePerDay: motor.pricePerDay,
      days,
      startDate: start,
      endDate: end,
      motorType: motor.type,
      motorId: motor.id,
      delivery,
      addOnIds: addons,
      addons,
      discount,
      promoCode,
      deposit: motor.deposit,
    });

    return {
      motor: {
        id: motor.id,
        name: motor.name,
        pricePerDay: motor.pricePerDay,
      },
      ...pricing,
      promo: promoDetails,
    };
  }

  /**
   * Membuat pemesanan sewa motor baru dengan serialisasi atomik transaksi.
   * Urutan penguncian baku: motorcycles -> bookings -> payments -> promo_codes
   */
  async createBooking(input, userId, idempotencyKey = null) {
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

    const {
      motorId,
      startDate,
      endDate,
      pickupTime = '09:00',
      pickupLocation,
      addons = [],
      delivery = {},
      pickup = 'store',
      payment = 'bank_transfer',
      promoCode,
      renter,
      notes = '',
      acceptedTermsVersion,
    } = input;

    // 1. Validasi Tanggal dan Durasi Kalender
    if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
      throw new AppError('Format tanggal sewa harus YYYY-MM-DD dan merupakan tanggal kalender yang valid.', 'INVALID_DATE_RANGE', 400);
    }

    if (isDateInPast(startDate)) {
      throw new AppError('Tanggal mulai sewa tidak boleh di masa lalu.', 'INVALID_DATE_RANGE', 400);
    }

    const s = parseDate(startDate);
    const e = parseDate(endDate);
    if (!s || !e || e <= s) {
      throw new AppError('Tanggal kembali harus setelah tanggal ambil.', 'INVALID_DATE_RANGE', 400);
    }

    const daysFromToday = getDaysFromToday(startDate);
    if (daysFromToday > RENTAL_RULES.maxAdvanceDays) {
      throw new AppError(`Pemesanan sewa maksimal dapat dilakukan hingga ${RENTAL_RULES.maxAdvanceDays} hari ke depan.`, 'INVALID_DATE_RANGE', 400);
    }

    let settings = null;
    try {
      settings = await settingsService.getSettings();
    } catch (e) {
      // fallback
    }
    const minRentalDays = settings?.minRentalDays ?? RENTAL_RULES.minDays;
    const maxRentalDays = settings?.maxRentalDays ?? RENTAL_RULES.maxDays;
    const bookingExpireMinutes = settings?.bookingExpireMinutes ?? settings?.paymentExpiryMinutes ?? env.BOOKING_EXPIRE_MINUTES ?? 60;
    const minRenterAge = settings?.minRenterAge ?? 18;

    const days = countDays(startDate, endDate);
    if (days < minRentalDays) {
      throw new AppError(`Durasi sewa minimal ${minRentalDays} hari.`, 'DURATION_OUT_OF_RANGE', 400);
    }

    if (days > maxRentalDays) {
      throw new AppError(
        `Durasi sewa maksimal ${maxRentalDays} hari (Anda memilih ${days} hari).`,
        'DURATION_OUT_OF_RANGE',
        400,
      );
    }

    if (renter && renter.age !== undefined && renter.age !== null) {
      const ageNum = Number(renter.age);
      if (!Number.isNaN(ageNum) && ageNum < minRenterAge) {
        throw new AppError(`Usia penyewa minimal ${minRenterAge} tahun.`, 'VALIDATION_ERROR', 400);
      }
    }

    // 2. Validasi Kesiapan Profil Penyewa (Sumber Data Tunggal renterReadiness)
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 'UNAUTHORIZED', 401);
    }

    const readiness = await renterProfileService.renterReadiness(userId);
    if (!readiness.isReady) {
      // Jika profil belum lengkap (ada missingFields) -> tolak dengan 403 PROFILE_INCOMPLETE
      if (readiness.missingFields && readiness.missingFields.length > 0) {
        throw new AppError(
          `Profil penyewa belum lengkap: ${readiness.issues.join(' ')} Silakan lengkapi profil Anda di menu Profil sebelum memesan.`,
          'PROFILE_INCOMPLETE',
          403,
          {
            issues: readiness.issues,
            missingFields: readiness.missingFields,
            pendingDocuments: readiness.pendingDocuments,
            actionUrl: '/profile#renter-data',
          },
        );
      }

      // Jika field profil lengkap tetapi dokumen belum verified
      if (env.REQUIRE_VERIFIED_DOCS) {
        throw new AppError(
          'Dokumen identitas (KTP & SIM) Anda belum terverifikasi. Silakan lengkapi dan verifikasi dokumen Anda di menu Profil sebelum melakukan pemesanan.',
          'DOCS_NOT_VERIFIED',
          403,
          {
            docsStatus: readiness.documents || user.documents || { ktp: 'not_uploaded', sim: 'not_uploaded' },
            pendingDocuments: readiness.pendingDocuments,
            actionUrl: '/profile#documents',
          },
        );
      }
    }

    return await transaction(async (tx) => {
      // 1. Cek Idempotency-Key di dalam transaksi: jika ada & request_hash sama -> kembalikan replay; jika hash beda -> 422
      if (idempotencyKey) {
        const existingKey = await tx.idempotencyRepo.findByKey(idempotencyKey, userId);
        if (existingKey) {
          if (existingKey.requestHash && existingKey.requestHash !== requestHash) {
            throw new AppError('Kunci idempotensi telah digunakan untuk permintaan dengan data yang berbeda.', 'IDEMPOTENCY_CONFLICT', 422);
          }
          const existingBooking = existingKey.responseBody;
          const m = await tx.motorRepo.findById(existingBooking.motorId || existingBooking.motorcycleId);
          return {
            ...existingBooking,
            motor: sanitizeMotor(m),
            timeline: buildTimeline(existingBooking),
            isIdempotentReplay: true,
          };
        }
      }

      // 2. SELECT ... FROM motorcycles WHERE id=$1 FOR UPDATE; tolak bila tidak ada atau status bukan active (MOTOR_UNAVAILABLE)
      let motor = null;
      if (tx.driver === 'postgres' && tx.client) {
        const mRes = await tx.client.query(
          'SELECT * FROM motorcycles WHERE id = $1 FOR UPDATE',
          [Number(motorId)],
        );
        if (mRes.rows.length === 0) {
          throw new AppError('Motor tidak ditemukan.', 'NOT_FOUND', 404);
        }
        const mRow = mRes.rows[0];
        if (mRow.status === 'maintenance' || mRow.status === 'inactive') {
          throw new AppError('Motor sedang tidak tersedia atau dalam masa servis berkala.', 'MOTOR_UNAVAILABLE', 409);
        }
        motor = await tx.motorRepo.findById(mRow.id);
      } else {
        motor = await tx.motorRepo.findById(motorId);
        if (!motor) {
          throw new AppError('Motor tidak ditemukan.', 'NOT_FOUND', 404);
        }
        if (motor.status === 'maintenance' || motor.status === 'inactive') {
          throw new AppError('Motor sedang tidak tersedia atau dalam masa servis berkala.', 'MOTOR_UNAVAILABLE', 409);
        }
      }

      // 3. Cek tabrakan dengan maintenance_blocks (overlap daterange) secara eksplisit di dalam transaksi
      if (tx.driver === 'postgres' && tx.client) {
        const mbRes = await tx.client.query(
          `SELECT 1 FROM maintenance_blocks
           WHERE motorcycle_id = $1
             AND daterange(start_date, end_date, '[)') && daterange($2::date, $3::date, '[)')
           LIMIT 1`,
          [Number(motor.id), startDate, endDate],
        );
        if (mbRes.rows.length > 0) {
          const availability = await availabilityService.checkAvailabilityWithNext(motor.id, startDate, endDate);
          throw new AppError(
            'Maaf, motor sudah tidak tersedia pada rentang tanggal yang dipilih.',
            'BOOKING_CONFLICT',
            409,
            {
              conflictDates: availability.conflictDates,
              nextAvailable: availability.nextAvailable,
            },
          );
        }
      } else {
        const { data } = store;
        const hasBookingConflict = (data.bookings || []).some((b) => {
          if (Number(b.motorId) !== Number(motor.id)) return false;
          if (!['pending', 'confirmed', 'active'].includes(b.status)) return false;
          return isOverlapping(startDate, endDate, b.startDate, b.endDate);
        });

        const hasServiceConflict = (data.serviceBlocks || []).some((s) => {
          if (Number(s.motorId) !== Number(motor.id)) return false;
          if (s.status === 'completed') return false;
          return isOverlapping(startDate, endDate, s.startDate, s.endDate);
        });

        if (hasBookingConflict || hasServiceConflict) {
          const availability = await availabilityService.checkAvailabilityWithNext(motor.id, startDate, endDate);
          throw new AppError(
            'Maaf, motor sudah tidak tersedia pada rentang tanggal yang dipilih.',
            'BOOKING_CONFLICT',
            409,
            {
              conflictDates: availability.conflictDates,
              nextAvailable: availability.nextAvailable,
            },
          );
        }
      }

      // 4. Hitung harga lewat pricingService yang sama (murni)
      let discount = 0;
      let promoId = null;
      if (promoCode) {
        const prelim = motor.pricePerDay * days;
        const promoRes = await promoService.validatePromo({
          code: promoCode,
          subtotal: prelim,
          days,
          startDate,
          endDate,
        });
        discount = promoRes.discount;
      }

      const pricing = await pricingService.calculatePriceAsync({
        pricePerDay: motor.pricePerDay,
        days,
        startDate,
        endDate,
        motorType: motor.type,
        motorId: motor.id,
        pickupMethod: pickup,
        delivery,
        addOnIds: addons,
        addons,
        discount,
        promoCode,
        deposit: motor.deposit,
      });

      // 5. Promo: UPDATE promo_codes SET used_count = used_count + 1 WHERE id=$1 AND is_active AND (usage_limit IS NULL OR used_count < usage_limit) AND valid_from <= tanggal_sekarang <= valid_until RETURNING id; jika 0 baris -> PROMO_INVALID
      if (promoCode) {
        if (tx.driver === 'postgres' && tx.client) {
          const pUpd = await tx.client.query(
            `UPDATE promo_codes
             SET used_count = used_count + 1, updated_at = now()
             WHERE upper(code) = upper($1)
               AND is_active = true
               AND (usage_limit IS NULL OR used_count < usage_limit)
               AND valid_from <= (now() AT TIME ZONE 'Asia/Jakarta')::date
               AND valid_until >= (now() AT TIME ZONE 'Asia/Jakarta')::date
             RETURNING id`,
            [promoCode.trim()],
          );
          if (pUpd.rows.length === 0) {
            throw new AppError('Kode promo tidak valid, telah kedaluwarsa, atau kuota habis.', 'PROMO_INVALID', 400);
          }
          promoId = pUpd.rows[0].id;
        } else {
          const promo = (store.data.promos || []).find((p) => p.code.toUpperCase() === promoCode.trim().toUpperCase());
          if (!promo || (promo.quota !== null && promo.quota !== undefined && promo.quota <= 0)) {
            throw new AppError('Kode promo tidak valid, telah kedaluwarsa, atau kuota habis.', 'PROMO_INVALID', 400);
          }
          if (promo.quota > 0) promo.quota -= 1;
        }
      }

      // 5.5. Batas Penyalahgunaan: Maksimal 1 pemesanan tunai belum diambil per pelanggan
      const isCash = payment === 'cash';
      if (isCash) {
        const maxCash = Number(settings?.maxUnclaimedCashBookings ?? 1);
        let pendingCashCount = 0;
        if (tx.driver === 'postgres' && tx.client) {
          const cRes = await tx.client.query(
            `SELECT COUNT(*)::int as count FROM bookings WHERE user_id = $1 AND status = 'pending' AND payment_method = 'cash'`,
            [Number(userId)],
          );
          pendingCashCount = cRes.rows[0].count;
        } else {
          pendingCashCount = store.getCollection('bookings').filter(
            (b) => Number(b.userId) === Number(userId) && b.status === 'pending' && (b.paymentMethod === 'cash' || b.payment === 'cash')
          ).length;
        }

        if (pendingCashCount >= maxCash) {
          throw new AppError(
            'Anda masih memiliki pemesanan tunai yang belum diambil. Selesaikan atau batalkan pemesanan tersebut terlebih dahulu.',
            'MAX_UNCLAIMED_CASH_BOOKING_EXCEEDED',
            400,
          );
        }
      }

      // 6. Kode booking: format RM-YYMMDD-XXXX; bila UNIQUE booking_code bentrok (23505 pada constraint itu), ulangi dengan kode baru hingga 5 kali.
      let createdBooking = null;
      let attempts = 0;
      const createdAt = clock.nowIso();

      // Perhitungan expiresAt:
      // - Tunai: waktu ambil + batas tunggu (cashExpireGraceHours, default 3 jam)
      // - Online: waktu buat + bookingExpireMinutes (default 60 menit)
      let expiresAt;
      if (isCash) {
        const cashGraceHours = Number(settings?.cashExpireGraceHours ?? 3);
        const pickupHour = pickupTime || '09:00';
        const pickupDateTime = new Date(`${startDate}T${pickupHour}:00+07:00`);
        expiresAt = new Date(pickupDateTime.getTime() + cashGraceHours * 60 * 60 * 1000).toISOString();
      } else {
        expiresAt = new Date(clock.now().getTime() + bookingExpireMinutes * 60 * 1000).toISOString();
      }

      const policySnapshot = {
        minRentalDays,
        maxRentalDays,
        bookingExpireMinutes,
        lateFeeToleranceMinutes: settings?.lateFeeToleranceMinutes ?? 120,
        lateFeePercentPerHour: settings?.lateFeePercentPerHour ?? 10,
        cancellationThresholdHours: settings?.cancellationThresholdHours ?? 24,
        cancellationRefundPercent: settings?.cancellationRefundPercent ?? 50,
        cancellationPolicy: settings?.cancellationPolicy ?? [
          { thresholdHours: 48, refundPercent: 100 },
          { thresholdHours: 24, refundPercent: 50 },
          { thresholdHours: 0, refundPercent: 0 },
        ],
        defaultDeposit: settings?.defaultDeposit ?? 200000,
        minRenterAge,
      };

      const termsVersion = await contentService.resolveTermsVersion(acceptedTermsVersion);

      const initialTimeline = [
        {
          status: BOOKING_STATUS.PENDING,
          at: createdAt,
          note: 'Pemesanan dibuat. Menunggu proses pembayaran dari pelanggan.',
        },
      ];

      while (attempts < 5) {
        attempts++;
        const code = generateBookingCode();

        const bookingRecord = {
          code,
          bookingCode: code,
          userId: Number(userId),
          motorId: Number(motor.id),
          motorcycleId: Number(motor.id),
          startDate,
          endDate,
          days,
          totalDays: days,
          pickupTime,
          pickupLocation: pickupLocation || (pickup === 'delivery' ? 'Antar ke Lokasi Pelanggan' : 'Kantor Pusat RodaKita'),
          pricePerDay: pricing.pricePerDay,
          subtotal: pricing.subtotal + (pricing.totalSurcharge || 0),
          baseSubtotal: pricing.subtotal,
          totalSurcharge: pricing.totalSurcharge || 0,
          weekendDays: pricing.weekendDays,
          weekendSurcharge: pricing.weekendSurcharge,
          durationDiscountPercent: pricing.durationDiscountPercent,
          durationDiscount: pricing.durationDiscount,
          deliveryFee: pricing.deliveryFee,
          deliveryTotal: pricing.deliveryFee,
          deliveryBreakdown: pricing.deliveryBreakdown,
          addOnsTotal: pricing.addOnsTotal,
          addonsTotal: pricing.addOnsTotal,
          selectedAddOns: pricing.selectedAddOns,
          addonsList: pricing.selectedAddOns,
          discount: pricing.discount,
          promoDiscount: pricing.discount,
          promoCode: promoCode ? promoCode.trim().toUpperCase() : null,
          deposit: pricing.deposit,
          totalRental: (pricing.subtotal + (pricing.totalSurcharge || 0) - (pricing.durationDiscount || 0) - (pricing.discount || 0) + (pricing.addOnsTotal || 0) + (pricing.deliveryFee || 0)),
          total: pricing.total,
          grandTotal: pricing.total,
          lineItems: pricing.lineItems,
          pricing: pricing.snapshot || pricing,
          pricingSnapshot: pricing.snapshot || pricing,
          policySnapshot,
          termsVersion,
          status: BOOKING_STATUS.PENDING,
          pickup,
          delivery,
          payment,
          renter: {
            name: readiness.profile?.fullNameKtp || (renter?.name ? renter.name.trim() : user.name),
            phone: readiness.profile?.phoneE164 || (renter?.phone ? renter.phone.trim() : user.phone),
            email: user.email || (renter?.email ? renter.email.trim().toLowerCase() : ''),
            idNumber: readiness.profile?.nikLast4 ? `••••••••••••${readiness.profile.nikLast4}` : (renter?.idNumber || ''),
            emergencyContact: readiness.profile?.emergencyContact || renter?.emergencyContact || null,
          },
          emergencyContact: readiness.profile?.emergencyContact || renter?.emergencyContact || null,
          renterSnapshot: {
            userId: Number(userId),
            fullNameKtp: readiness.profile?.fullNameKtp || user.name,
            birthDate: readiness.profile?.birthDate || null,
            nikLast4: readiness.profile?.nikLast4 || null,
            nikMasked: readiness.profile?.nikMasked || (readiness.profile?.nikLast4 ? `••••••••••••${readiness.profile.nikLast4}` : null),
            addressKtp: readiness.profile?.addressKtp || user.address || '',
            phone: readiness.profile?.phoneE164 || user.phone,
            phoneE164: readiness.profile?.phoneE164 || user.phone,
            stayAddress: readiness.profile?.stayAddress || '',
            emergencyContact: readiness.profile?.emergencyContact || null,
            termsVersionAccepted: readiness.profile?.termsVersionAccepted || termsVersion || 1,
            privacyVersionAccepted: readiness.profile?.privacyVersionAccepted || 1,
            gpsConsentAt: readiness.profile?.gpsConsentAt || createdAt,
            documentsStatus: readiness.documents,
            verifiedAt: readiness.profile?.completedAt || (readiness.isReady ? createdAt : null),
          },
          addons: addons || [],
          notes: notes || '',
          paymentMethod: payment || 'bank_transfer',
          version: 1,
          createdAt,
          expiresAt,
          idempotencyKey: idempotencyKey || null,
          requestHash: requestHash || '',
          timeline: initialTimeline,
        };

        try {
          createdBooking = await tx.bookingRepo.create(bookingRecord);
          break;
        } catch (err) {
          // Bentrok unik booking_code (23505) -> ulangi dengan kode baru hingga 5 kali
          if (err.code === '23505' && (err.constraint === 'bookings_booking_code_key' || err.message?.includes('booking_code'))) {
            if (attempts >= 5) {
              throw new AppError('Gagal menghasilkan kode pemesanan unik setelah 5 percobaan.', 'INTERNAL_ERROR', 500);
            }
            continue;
          }

          // Tabrakan dengan booking lain ditangkap constraint no_double_booking (23P01) -> BOOKING_CONFLICT 409
          if (
            err.code === '23P01' ||
            err.constraint === 'no_double_booking' ||
            err.code === 'BOOKING_CONFLICT' ||
            err.message?.includes('no_double_booking') ||
            err.message?.includes('jadwal bertabrakan')
          ) {
            let conflictDates = [];
            let nextAvailable = null;
            try {
              const availability = await availabilityService.checkAvailabilityWithNext(motor.id, startDate, endDate);
              conflictDates = availability.conflictDates;
              nextAvailable = availability.nextAvailable;
            } catch (availErr) {
              /* ignore fallback error under extreme pool contention */
            }
            throw new AppError(
              'Maaf, motor sudah tidak tersedia pada rentang tanggal yang dipilih.',
              'BOOKING_CONFLICT',
              409,
              {
                conflictDates,
                nextAvailable,
              },
            );
          }

          throw err;
        }
      }

      // Catat promo_redemptions
      if (promoId && tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          `INSERT INTO promo_redemptions (booking_id, promo_id, user_id, discount_amount, redeemed_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (booking_id) DO NOTHING`,
          [createdBooking.id, promoId, Number(userId), pricing.discount || 0],
        );
      }

      // Buat entri payment pending awal
      const initialPaymentMethod = payment === 'cash' ? 'cash' : (payment || 'bank_transfer');
      const initialProvider = 'simulation';
      const initialAmount = Number(createdBooking.grandTotal || pricing.total || 0);

      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          `INSERT INTO payments (booking_id, method, provider, status, amount, created_at, updated_at)
           VALUES ($1, $2, $3, 'pending', $4, now(), now())`,
          [createdBooking.id, initialPaymentMethod, initialProvider, initialAmount],
        );
      } else if (tx.paymentRepo && typeof tx.paymentRepo.create === 'function') {
        await tx.paymentRepo.create({
          bookingId: createdBooking.id,
          method: initialPaymentMethod,
          provider: initialProvider,
          status: 'pending',
          amount: initialAmount,
        });
      }

      // Update otomatis status motor di PostgreSQL menjadi 'rented' saat dipesan/disewa
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          "UPDATE motorcycles SET status = 'rented', updated_at = now() WHERE id = $1",
          [Number(motor.id)],
        );
      } else {
        await tx.motorRepo.update(motor.id, { status: 'rented' });
      }

      // Realtime Outbox Events: booking baru dibuat
      await eventBroadcaster.publish(tx, {
        type: 'booking.updated',
        entityId: String(createdBooking.id),
        userId: Number(userId),
        version: 1,
        payload: { id: createdBooking.id, code: createdBooking.code, status: createdBooking.status },
      });
      await eventBroadcaster.publish(tx, {
        type: 'motor.availability.changed',
        entityId: String(motorId),
        userId: null,
        version: 1,
        payload: { motorId: Number(motorId) },
      });
      await eventBroadcaster.publish(tx, {
        type: 'counters.changed',
        entityId: 'bookings',
        userId: null,
        payload: { action: 'booking_created' },
      });

      const result = {
        ...createdBooking,
        motor: sanitizeMotor(motor),
        timeline: buildTimeline(createdBooking),
      };

      // Simpan hasil di idempotency_keys di transaksi yang sama
      if (idempotencyKey) {
        await tx.idempotencyRepo.create({
          userId: Number(userId),
          key: idempotencyKey.trim(),
          requestHash,
          statusCode: 201,
          responseBody: result,
        });
      }

      // 7. COMMIT & Return
      return result;
    });
  }

  async getMyBookings(userId, query = {}) {
    const { status, search, page = 1, limit = 10 } = query;
    const safeLimit = Math.max(1, parseInt(limit, 10) || 10);
    const safePage = Math.max(1, parseInt(page, 10) || 1);

    // 1. Ringkasan hitung status booking (counts per tab): satu query GROUP BY
    const counts = await bookingRepo.countStatusByUserId(userId);

    // 2. Ambil data terpaginasi langsung dari database
    const { items, total } = await bookingRepo.findByUserId(
      userId,
      { status: status && status !== 'all' ? status : null, search },
      { page: safePage, limit: safeLimit },
    );

    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    const enriched = await Promise.all(
      items.map(async (b) => {
        const [motor, payment] = await Promise.all([
          motorRepo.findById(b.motorId),
          paymentRepo.findByBookingId(b.id),
        ]);
        const capabilities = bookingCapabilities(b, payment, { id: userId, role: 'customer' });
        return {
          ...b,
          capabilities,
          motor: sanitizeMotor(motor),
          timeline: buildTimeline(b),
        };
      }),
    );

    return {
      items: enriched,
      counts,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Detail booking. Hanya pemilik yang diizinkan; selain pemilik -> kembalikan 404!
   */
  async getBookingDetail(idOrCode, user) {
    const isNum = /^\d+$/.test(idOrCode);
    let booking = null;
    if (env.USE_DB === 'postgres') {
      booking = isNum ? await bookingRepo.findById(idOrCode) : await bookingRepo.findByCode(idOrCode);
    } else {
      booking = store
        .getCollection('bookings')
        .find((b) => (isNum ? Number(b.id) === Number(idOrCode) : b.code.toUpperCase() === idOrCode.toUpperCase()));
    }

    // Jika tidak ada atau bukan pemilik (dan bukan admin/staff) -> kembalikan 404
    if (!booking || (user.role !== 'admin' && user.role !== 'staff' && Number(booking.userId) !== Number(user.id))) {
      throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
    }

    const [motor, payment] = await Promise.all([
      motorRepo.findById(booking.motorId),
      paymentRepo.findByBookingId(booking.id),
    ]);
    const capabilities = bookingCapabilities(booking, payment, user);

    return {
      ...booking,
      capabilities,
      motor: sanitizeMotor(motor, user.role === 'admin'),
      timeline: buildTimeline(booking),
    };
  }

  /**
   * Pembatalan booking oleh pelanggan sesuai aturan bisnis RodaKita:
   * - pending: Bebas biaya.
   * - confirmed:
   *   - > 48 jam sebelum start: Refund 100% biaya sewa + 100% deposit (bebas biaya pembatalan).
   *   - 24 - 48 jam sebelum start: Refund 50% biaya sewa + 100% deposit (denda 50% sewa).
   *   - < 24 jam sebelum start: Biaya sewa hangus (0%), 100% deposit dikembalikan.
   * - active / completed: Tidak dapat dibatalkan.
   */
  /**
   * Pembatalan booking oleh pelanggan (Atomic Transaction):
   * 1. Kunci baris booking FOR UPDATE.
   * 2. Validasi status dan transisi.
   * 3. Hitung refund berjenjang (pending bebas biaya; confirmed >48 jam 100%, 24-48 jam 50%, <24 jam 0%) memakai waktu server.
   * 4. Update status, refund_amount, cancel_reason, cancelled_at, dan timeline.
   * 5. Lepas promo (promo_redemptions.released_at diisi & promo_codes.used_count - 1, hanya sekali).
   * 6. Kunci payment FOR UPDATE: jika paid & refund > 0 -> refunded, selain itu tetap paid.
   */
  async cancelBooking(idOrCode, payloadOrReason, user) {
    const payload = typeof payloadOrReason === 'object' && payloadOrReason !== null
      ? payloadOrReason
      : { reason: payloadOrReason || '' };

    const reason = (payload.reason || '').trim();
    const clientVersion = payload.version;
    const requestedRefund = payload.refundAmount;

    return await transaction(async (tx) => {
      const isNum = /^\d+$/.test(idOrCode);
      let rawBooking = null;
      let booking = null;

      // 1. Kunci baris booking FOR UPDATE
      if (tx.driver === 'postgres' && tx.client) {
        const bRes = await tx.client.query(
          `SELECT * FROM bookings WHERE ${isNum ? 'id = $1' : 'upper(booking_code) = upper($1)'} FOR UPDATE`,
          [isNum ? Number(idOrCode) : String(idOrCode).trim()],
        );
        if (bRes.rows.length === 0) {
          throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
        }
        rawBooking = bRes.rows[0];
        booking = await tx.bookingRepo.findById(rawBooking.id);
      } else {
        booking = store
          .getCollection('bookings')
          .find((b) => (isNum ? Number(b.id) === Number(idOrCode) : b.code.toUpperCase() === String(idOrCode).toUpperCase()));
        if (!booking) {
          throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
        }
      }

      if (user.role !== 'admin' && user.role !== 'staff' && Number(booking.userId) !== Number(user.id)) {
        throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
      }

      // 2. Idempotensi: jika booking sudah cancelled, return sukses idempotent
      if (booking.status === BOOKING_STATUS.CANCELLED) {
        const motor = await tx.motorRepo.findById(booking.motorId);
        return {
          ...booking,
          idempotent: true,
          motor: sanitizeMotor(motor, user.role === 'admin'),
          timeline: buildTimeline(booking),
          message: 'Pemesanan sudah dibatalkan sebelumnya.',
        };
      }

      // 3. Optimistic Concurrency: cek version jika klien mengirimkan version
      if (clientVersion !== undefined && clientVersion !== null) {
        if (Number(clientVersion) !== Number(booking.version || 1)) {
          throw new AppError('Data sudah berubah, halaman diperbarui.', 'STALE_DATA', 409, {
            currentVersion: Number(booking.version || 1),
          });
        }
      }

      // 4. Kunci dan ambil payment terkait
      let payment = null;
      if (tx.driver === 'postgres' && tx.client) {
        const pRes = await tx.client.query(
          'SELECT * FROM payments WHERE booking_id = $1 FOR UPDATE',
          [rawBooking.id],
        );
        if (pRes.rows.length > 0) {
          payment = pRes.rows[0];
        }
      } else {
        payment = await tx.paymentRepo.findByBookingId(booking.id);
      }

      // 5. Evaluasi Capabilities Pembatalan
      const capabilities = bookingCapabilities(booking, payment, user);
      if (!capabilities.canCancel) {
        if (user.role === 'staff' && (booking.status === 'confirmed' || booking.paidAt || payment?.status === 'paid')) {
          throw new AppError('Hanya admin yang berhak membatalkan pemesanan berbayar.', 'FORBIDDEN_ROLE', 403);
        }
        throw new AppError(
          capabilities.cancelBlockedReason || `Pemesanan dengan status '${booking.status}' tidak dapat dibatalkan.`,
          'CANCELLATION_BLOCKED',
          400,
        );
      }

      // 6. Batas Penyalahgunaan untuk Pelanggan (Maksimal 3 pembatalan dalam 30 hari)
      let settings = null;
      try {
        settings = await settingsService.getSettings();
      } catch (e) {
        settings = {};
      }

      if (user.role === 'customer') {
        const maxCancellations = Number(settings?.maxCancellationsPer30Days ?? 3);
        let cancelCount = 0;
        if (tx.driver === 'postgres' && tx.client) {
          const cRes = await tx.client.query(
            `SELECT COUNT(*)::int as count FROM bookings
             WHERE user_id = $1 AND status = 'cancelled'
               AND cancelled_by = 'customer'
               AND cancelled_at >= now() - INTERVAL '30 days'`,
            [Number(booking.userId)],
          );
          cancelCount = cRes.rows[0].count;
        } else {
          const thirtyDaysAgo = new Date(clock.now().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          cancelCount = store.getCollection('bookings').filter(
            (b) => Number(b.userId) === Number(booking.userId) && b.status === 'cancelled' && b.cancelledBy === 'customer' && b.cancelledAt && b.cancelledAt >= thirtyDaysAgo
          ).length;
        }

        if (cancelCount >= maxCancellations) {
          throw new AppError(
            `Batas pembatalan mandiri tercapai (maksimal ${maxCancellations} kali dalam 30 hari). Silakan hubungi admin untuk bantuan pembatalan.`,
            'CANCELLATION_LIMIT_EXCEEDED',
            400,
          );
        }
      }

      // 7. Penentuan Refund Amount
      let refundAmount = 0;
      const isPaid = booking.status === 'confirmed' || Boolean(booking.paidAt) || payment?.status === 'paid';
      const totalPaid = Number(booking.grandTotal || booking.total || 0);

      if (user.role === 'admin') {
        if (isPaid) {
          if (!reason) {
            throw new AppError('Alasan pembatalan wajib diisi oleh admin.', 'VALIDATION_ERROR', 400);
          }
          if (requestedRefund !== undefined && requestedRefund !== null) {
            const numRefund = Number(requestedRefund);
            if (numRefund < 0 || numRefund > totalPaid) {
              throw new AppError('Jumlah refund tidak boleh negatif atau melebihi total yang dibayar.', 'VALIDATION_ERROR', 400);
            }
            refundAmount = numRefund;
          } else {
            refundAmount = totalPaid;
          }
        } else {
          refundAmount = 0;
        }
      } else {
        refundAmount = 0;
      }

      const nowIso = clock.nowIso();
      const nextVersion = Number(booking.version || 1) + 1;
      const cancelledBy = user.role === 'admin' ? 'admin' : (user.role === 'staff' ? 'staff' : 'customer');
      const finalReason = reason || (user.role === 'customer' ? 'Dibatalkan oleh pelanggan' : 'Dibatalkan oleh admin');

      const timelineNote = `Dibatalkan oleh ${user.name || user.role}. Alasan: ${finalReason}.${refundAmount > 0 ? ` Refund: Rp ${refundAmount.toLocaleString('id-ID')}` : ''}`;
      const currentTimeline = Array.isArray(booking.timeline) ? [...booking.timeline] : buildTimeline(booking);
      currentTimeline.push({
        status: BOOKING_STATUS.CANCELLED,
        at: nowIso,
        note: timelineNote,
      });

      // 8. Update DB (Status -> cancelled, version -> version + 1)
      let updated = null;
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          `UPDATE bookings
           SET status = 'cancelled',
               cancelled_by = $1,
               cancel_reason = $2,
               refund_amount = $3,
               version = $4,
               cancelled_at = now(),
               updated_at = now()
           WHERE id = $5`,
          [cancelledBy, finalReason, refundAmount, nextVersion, rawBooking.id],
        );

        await tx.client.query(
          `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
           VALUES ($1, 'cancelled', $2, $3, now())`,
          [rawBooking.id, timelineNote, cancelledBy],
        );

        // Otomatis kembalikan status motor menjadi 'active' (tersedia) jika tidak ada booking aktif lain
        const remaining = await tx.client.query(
          `SELECT 1 FROM bookings
           WHERE motorcycle_id = $1
             AND status IN ('pending', 'confirmed', 'active')
             AND id <> $2
           LIMIT 1`,
          [Number(booking.motorId), Number(rawBooking.id)],
        );
        if (remaining.rows.length === 0) {
          await tx.client.query(
            "UPDATE motorcycles SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'rented'",
            [Number(booking.motorId)],
          );
        }

        updated = await tx.bookingRepo.findById(rawBooking.id);
      } else {
        updated = await tx.bookingRepo.update(booking.id, {
          status: BOOKING_STATUS.CANCELLED,
          cancelledBy,
          cancelReason: finalReason,
          cancellationReason: finalReason,
          refundAmount,
          version: nextVersion,
          cancelledAt: nowIso,
          timeline: currentTimeline,
        });
      }

      // 9. Lepas Promo Quota Tepat Sekali
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
        const promo = (store.data.promos || []).find((p) => p.code.toUpperCase() === booking.promoCode.toUpperCase());
        if (promo && promo.quota !== null && promo.quota !== undefined) {
          promo.quota += 1;
        }
      }

      // 10. Update Status Pembayaran:
      // - Pending -> cancelled
      // - Paid dengan refund > 0 -> refunded
      if (payment) {
        if (tx.driver === 'postgres' && tx.client) {
          if (payment.status === 'pending') {
            await tx.client.query(
              `UPDATE payments SET status = 'cancelled', updated_at = now() WHERE id = $1`,
              [payment.id],
            );
          } else if (payment.status === 'paid' && refundAmount > 0) {
            await tx.client.query(
              `UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = $1`,
              [payment.id],
            );
          }
        } else {
          if (payment.status === 'pending') {
            await tx.paymentRepo.update(payment.id, { status: 'cancelled' });
          } else if (payment.status === 'paid' && refundAmount > 0) {
            await tx.paymentRepo.update(payment.id, { status: 'refunded' });
          }
        }
      }

      // 11. Audit Log
      if (tx.auditRepo) {
        await tx.auditRepo.create({
          actorId: user.id ? Number(user.id) : null,
          actorRole: user.role || 'customer',
          actorName: user.name || user.role,
          action: 'CANCEL_BOOKING',
          entityType: 'Booking',
          entityId: String(booking.id),
          before: { status: booking.status, version: booking.version },
          after: { status: 'cancelled', version: nextVersion, refundAmount, cancelledBy },
        });
      }

      // 12. Realtime Outbox Events: booking dibatalkan
      await eventBroadcaster.publish(tx, {
        type: 'booking.updated',
        entityId: String(booking.id),
        userId: Number(booking.userId),
        version: nextVersion,
        payload: { id: booking.id, code: booking.code, status: 'cancelled' },
      });
      await eventBroadcaster.publish(tx, {
        type: 'payment.updated',
        entityId: String(payment?.id || booking.id),
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
        payload: { action: 'booking_cancelled' },
      });

      const motor = await tx.motorRepo.findById(booking.motorId);
      const finalCapabilities = bookingCapabilities(updated, payment, user);

      return {
        ...updated,
        capabilities: finalCapabilities,
        refundAmount,
        motor: sanitizeMotor(motor, user.role === 'admin'),
        timeline: buildTimeline(updated),
      };
    });
  }

  /**
   * Pengajuan pengembalian motor oleh pelanggan saat sewa sedang berjalan (active -> return_requested).
   */
  async requestReturn(idOrCode, payload = {}, user) {
    const fs = require('fs');
    const path = require('path');

    return await transaction(async (tx) => {
      const isNum = /^\d+$/.test(String(idOrCode));
      let booking = null;

      if (tx.driver === 'postgres' && tx.client) {
        const bRes = await tx.client.query(
          `SELECT * FROM bookings WHERE ${isNum ? 'id = $1' : 'upper(booking_code) = upper($1)'} FOR UPDATE`,
          [isNum ? Number(idOrCode) : String(idOrCode).trim()],
        );
        if (bRes.rows.length === 0) {
          throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
        }
        booking = await tx.bookingRepo.findById(bRes.rows[0].id);
      } else {
        booking = store
          .getCollection('bookings')
          .find((b) => (isNum ? Number(b.id) === Number(idOrCode) : b.code.toUpperCase() === String(idOrCode).toUpperCase()));
        if (!booking) {
          throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
        }
      }

      if (user.role !== 'admin' && user.role !== 'staff' && Number(booking.userId) !== Number(user.id)) {
        throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
      }

      if (booking.status === BOOKING_STATUS.RETURN_REQUESTED) {
        const motor = await tx.motorRepo.findById(booking.motorId);
        const payment = await tx.paymentRepo.findByBookingId(booking.id);
        return {
          ...booking,
          idempotent: true,
          capabilities: bookingCapabilities(booking, payment, user),
          motor: sanitizeMotor(motor, user.role === 'admin'),
          timeline: buildTimeline(booking),
        };
      }

      if (booking.status !== BOOKING_STATUS.ACTIVE) {
        throw new AppError(
          `Pengajuan pengembalian hanya dapat dilakukan saat sewa berstatus 'active'. Status saat ini: '${booking.status}'.`,
          'INVALID_STATUS_TRANSITION',
          400,
        );
      }

      const rawMethod = String(payload.returnMethod || payload.method || 'store').toLowerCase().trim();
      const returnMethod = rawMethod === 'pickup' ? 'pickup' : 'store';
      const returnCustomerNotes = String(payload.notes || payload.returnCustomerNotes || '').trim();
      let returnPhotoUrl = payload.photoUrl || payload.returnPhotoUrl || null;

      // Jika dikirim dalam format data:image/... base64, simpan ke direktori uploads/documents/
      if (typeof returnPhotoUrl === 'string' && returnPhotoUrl.startsWith('data:image/')) {
        try {
          const matches = returnPhotoUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'png' ? '.png' : matches[1] === 'webp' ? '.webp' : '.jpg';
            const buf = Buffer.from(matches[2], 'base64');
            const dir = path.join(env.UPLOAD_DIR, 'documents');
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            const fileName = `return_booking_${booking.id}_${Date.now()}${ext}`;
            fs.writeFileSync(path.join(dir, fileName), buf);
            returnPhotoUrl = `uploads/documents/${fileName}`;
          }
        } catch {
          // fallback biarkan atau kosongkan jika gagal simpan
        }
      }

      const nowIso = clock.nowIso();
      const nextVersion = Number(booking.version || 1) + 1;
      const methodLabel = returnMethod === 'pickup' ? 'Minta Jemput Petugas (Pickup)' : 'Kembalikan ke Toko';
      const timelineNote = `Pelanggan mengajukan pengembalian motor (${methodLabel}).${returnCustomerNotes ? ` Catatan: ${returnCustomerNotes}` : ''}`;

      const currentTimeline = Array.isArray(booking.timeline) ? [...booking.timeline] : buildTimeline(booking);
      currentTimeline.push({
        status: BOOKING_STATUS.RETURN_REQUESTED,
        actor: 'customer',
        at: nowIso,
        note: timelineNote,
      });

      const updated = await tx.bookingRepo.update(booking.id, {
        status: BOOKING_STATUS.RETURN_REQUESTED,
        returnRequestedAt: nowIso,
        returnMethod,
        returnCustomerNotes,
        returnPhotoUrl,
        version: nextVersion,
        timeline: currentTimeline,
      });

      await eventBroadcaster.publish(tx, {
        type: 'booking.updated',
        entityId: String(booking.id),
        userId: Number(booking.userId),
        version: nextVersion,
        payload: {
          id: booking.id,
          code: booking.code,
          status: BOOKING_STATUS.RETURN_REQUESTED,
          returnMethod,
          returnRequestedAt: nowIso,
        },
      });
      await eventBroadcaster.publish(tx, {
        type: 'counters.changed',
        entityId: 'bookings',
        userId: null,
        payload: { action: 'return_requested' },
      });

      const [motor, payment] = await Promise.all([
        tx.motorRepo.findById(booking.motorId),
        tx.paymentRepo.findByBookingId(booking.id),
      ]);

      return {
        ...updated,
        capabilities: bookingCapabilities(updated, payment, user),
        motor: sanitizeMotor(motor, user.role === 'admin'),
        timeline: buildTimeline(updated),
      };
    });
  }

  async getBookingIcs(idOrCode, user) {
    const isNum = /^\d+$/.test(idOrCode);
    let booking = null;
    if (env.USE_DB === 'postgres') {
      booking = isNum ? await bookingRepo.findById(idOrCode) : await bookingRepo.findByCode(idOrCode);
    } else {
      booking = store
        .getCollection('bookings')
        .find((b) => (isNum ? Number(b.id) === Number(idOrCode) : b.code.toUpperCase() === idOrCode.toUpperCase()));
    }

    if (!booking || (user.role !== 'admin' && Number(booking.userId) !== Number(user.id))) {
      throw new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
    }

    const motor = await motorRepo.findById(booking.motorId);
    const icsContent = generateBookingICS(booking, motor);

    return {
      filename: `rental-rodakita-${booking.code}.ics`,
      content: icsContent,
    };
  }
}

module.exports = new BookingService();
