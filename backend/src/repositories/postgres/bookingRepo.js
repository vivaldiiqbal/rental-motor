const { pool } = require('../../../db/pool');
const { mapBooking, toISODate } = require('./mappers');
const { handlePgError } = require('./errors');
const { BLOCKING_BOOKING_STATUSES } = require('../../config/constants');

function escapeLike(str) {
  return String(str || '').replace(/([%_\\])/g, '\\$1');
}

const BASE_BOOKING_SELECT = `
  SELECT
    b.*,
    p.code AS promo_code,
    COALESCE(b.payment_method, pay.method, 'bank_transfer') AS payment_method,
    COALESCE(pay.status, CASE WHEN b.status IN ('confirmed', 'active', 'completed') THEN 'paid' WHEN b.status = 'cancelled' THEN 'cancelled' ELSE 'pending' END) AS payment_status,
    bh.odometer_start AS handover_odometer_start,
    bh.fuel_start AS handover_fuel_start,
    bh.notes AS handover_notes,
    bh.documents_checked AS handover_documents_checked,
    bh.deposit_received AS handover_deposit_received,
    bh.handed_over_at AS handover_handed_over_at,
    bh.handed_over_by AS handover_handed_over_by,
    u_h.name AS handover_handed_by_name,
    br.returned_at AS return_returned_at,
    br.odometer_end AS return_odometer_end,
    br.fuel_end AS return_fuel_end,
    br.notes AS return_notes,
    br.late_minutes AS return_late_minutes,
    br.late_fee AS return_late_fee,
    br.damage_fee AS return_damage_fee,
    br.other_fee AS return_other_fee,
    br.deposit_snapshot AS return_deposit_snapshot,
    br.deposit_refund AS return_deposit_refund,
    br.amount_due AS return_amount_due,
    br.deposit_refunded_at AS return_deposit_refunded_at,
    br.deposit_refunded_by AS return_deposit_refunded_by,
    br.received_by AS return_received_by,
    u_r.name AS return_received_by_name,
    COALESCE(
      (SELECT json_agg(bi.*) FROM booking_items bi WHERE bi.booking_id = b.id),
      '[]'::json
    ) AS items,
    COALESCE(
      (SELECT json_agg(bt.* ORDER BY bt.at ASC) FROM booking_timeline bt WHERE bt.booking_id = b.id),
      '[]'::json
    ) AS timeline
  FROM bookings b
  LEFT JOIN promo_codes p ON b.promo_code_id = p.id
  LEFT JOIN (
    SELECT DISTINCT ON (booking_id) booking_id, method, status
    FROM payments
    ORDER BY booking_id, id DESC
  ) pay ON pay.booking_id = b.id
  LEFT JOIN booking_handovers bh ON bh.booking_id = b.id
  LEFT JOIN users u_h ON u_h.id = bh.handed_over_by
  LEFT JOIN booking_returns br ON br.booking_id = b.id
  LEFT JOIN users u_r ON u_r.id = br.received_by
`;

const bookingRepo = {
  async findById(id, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return null;
    const db = client || pool;
    try {
      const res = await db.query(`${BASE_BOOKING_SELECT} WHERE b.id = $1`, [Number(id)]);
      return res.rows.length > 0 ? mapBooking(res.rows[0], res.rows[0].items, res.rows[0].timeline) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByCode(code, client = null) {
    if (!code) return null;
    const db = client || pool;
    try {
      const res = await db.query(`${BASE_BOOKING_SELECT} WHERE upper(b.booking_code) = upper($1)`, [code.trim()]);
      return res.rows.length > 0 ? mapBooking(res.rows[0], res.rows[0].items, res.rows[0].timeline) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByIdempotencyKey(userId, key, client = null) {
    if (!key) return null;
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2',
        [Number(userId), key.trim()],
      );
      if (res.rows.length === 0) return null;
      return res.rows[0].response_body;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.status && filter.status !== 'all') {
        params.push(filter.status);
        conditions.push(`b.status = $${params.length}`);
      }

      if (filter.motorId) {
        params.push(Number(filter.motorId));
        conditions.push(`b.motorcycle_id = $${params.length}`);
      }

      if (filter.userId) {
        params.push(Number(filter.userId));
        conditions.push(`b.user_id = $${params.length}`);
      }

      if (filter.startDate) {
        params.push(filter.startDate);
        conditions.push(`b.start_date >= $${params.length}`);
      }

      if (filter.endDate) {
        params.push(filter.endDate);
        conditions.push(`b.end_date <= $${params.length}`);
      }

      if (filter.dateRange && filter.dateRange.start && filter.dateRange.end) {
        params.push(filter.dateRange.start);
        const pStart = `$${params.length}`;
        params.push(filter.dateRange.end);
        const pEnd = `$${params.length}`;
        conditions.push(`(b.start_date <= ${pEnd}::date AND b.end_date >= ${pStart}::date)`);
      }

      if (filter.search) {
        const escaped = `%${escapeLike(filter.search.toLowerCase())}%`;
        params.push(escaped);
        const pNum = `$${params.length}`;
        conditions.push(
          `(lower(b.booking_code) LIKE ${pNum} OR lower(b.renter_name) LIKE ${pNum} OR lower(b.renter_phone) LIKE ${pNum} OR lower(b.renter_email) LIKE ${pNum})`,
        );
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM bookings b ${whereClause}`, params);
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 10);
      const offset = (page - 1) * limit;

      const sortWhitelist = {
        id: 'b.id',
        created_at: 'b.created_at',
        createdAt: 'b.created_at',
        start_date: 'b.start_date',
        startDate: 'b.start_date',
        end_date: 'b.end_date',
        endDate: 'b.end_date',
        total: 'b.grand_total',
        grand_total: 'b.grand_total',
        grandTotal: 'b.grand_total',
        status: 'b.status',
      };

      const sortColumn = sortWhitelist[filter.sortBy] || 'b.created_at';
      const sortDirection = String(filter.sortOrder || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `${BASE_BOOKING_SELECT} ${whereClause} ORDER BY ${sortColumn} ${sortDirection}, b.id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      const items = res.rows.map((r) => mapBooking(r, r.items, r.timeline));
      return { items, total };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findBatchForCsv(filter = {}, batchSize = 1000, maxRows = 50000, client = null) {
    const db = client || pool;
    let offset = 0;
    const allItems = [];

    while (offset < maxRows) {
      const currentBatchLimit = Math.min(batchSize, maxRows - offset);
      const { items } = await this.findAll(
        filter,
        { page: Math.floor(offset / batchSize) + 1, limit: currentBatchLimit },
        db,
      );
      if (!items || items.length === 0) break;
      allItems.push(...items);
      offset += items.length;
      if (items.length < currentBatchLimit) break;
    }

    return allItems;
  },

  async findConflictingForMotor(motorId, fromDate = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `${BASE_BOOKING_SELECT}
         WHERE b.motorcycle_id = $1
           AND b.status IN ('pending', 'confirmed', 'active', 'return_requested')
           AND b.end_date >= COALESCE($2::date, CURRENT_DATE)
         ORDER BY b.start_date ASC, b.id ASC`,
        [Number(motorId), fromDate],
      );
      return res.rows.map((r) => mapBooking(r, r.items, r.timeline));
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async countStatusSummary(filter = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.motorId) {
        params.push(Number(filter.motorId));
        conditions.push(`motorcycle_id = $${params.length}`);
      }
      if (filter.userId) {
        params.push(Number(filter.userId));
        conditions.push(`user_id = $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const res = await db.query(
        `SELECT status, COUNT(*)::int AS count
         FROM bookings
         ${whereClause}
         GROUP BY status`,
        params,
      );

      const counts = {
        all: 0,
        pending: 0,
        confirmed: 0,
        active: 0,
        return_requested: 0,
        completed: 0,
        cancelled: 0,
        expired: 0,
      };

      for (const row of res.rows) {
        if (counts[row.status] !== undefined) {
          counts[row.status] = Number(row.count);
        }
        counts.all += Number(row.count);
      }

      return counts;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByUserId(userId, filter = {}, paging = {}, client = null) {
    return this.findAll({ ...filter, userId }, paging, client);
  },

  async findOverlapping(motorId, start, end, excludeId = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `${BASE_BOOKING_SELECT}
         WHERE b.motorcycle_id = $1
           AND b.status IN ('pending', 'confirmed', 'active', 'return_requested')
           AND daterange(b.start_date, b.end_date, '[)') && daterange($2::date, $3::date, '[)')
           AND ($4::int IS NULL OR b.id <> $4::int)
         ORDER BY b.start_date ASC`,
        [Number(motorId), start, end, excludeId ? Number(excludeId) : null],
      );
      return res.rows.map((r) => mapBooking(r, r.items, r.timeline));
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async countStatusByUserId(userId, client = null) {
    return this.countStatusSummary({ userId }, client);
  },

  async getUnavailableDates(motorId, fromDate = null, toDate = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT DISTINCT d::text AS unavailable_date
         FROM (
           SELECT generate_series(start_date, end_date - 1, interval '1 day')::date AS d
           FROM bookings
           WHERE motorcycle_id = $1
             AND status IN ('pending', 'confirmed', 'active', 'return_requested')
             AND daterange(start_date, end_date, '[)') && daterange(COALESCE($2::date, CURRENT_DATE), COALESCE($3::date, CURRENT_DATE + 180), '[)')
           UNION ALL
           SELECT generate_series(start_date, end_date - 1, interval '1 day')::date AS d
           FROM maintenance_blocks
           WHERE motorcycle_id = $1
             AND (status IS NULL OR status <> 'completed')
             AND completed_at IS NULL
             AND daterange(start_date, end_date, '[)') && daterange(COALESCE($2::date, CURRENT_DATE), COALESCE($3::date, CURRENT_DATE + 180), '[)')
         ) s
         WHERE d >= COALESCE($2::date, CURRENT_DATE)
           AND d < COALESCE($3::date, CURRENT_DATE + 180)
         ORDER BY unavailable_date ASC`,
        [Number(motorId), fromDate, toDate],
      );
      return res.rows.map((r) => r.unavailable_date);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findBlockedRanges(motorId, fromDate = null, toDate = null, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `SELECT start_date, end_date FROM bookings
         WHERE motorcycle_id = $1
           AND status IN ('pending', 'confirmed', 'active', 'return_requested')
           AND ($2::date IS NULL OR end_date > $2::date)
           AND ($3::date IS NULL OR start_date < $3::date)
         UNION ALL
         SELECT start_date, end_date FROM maintenance_blocks
         WHERE motorcycle_id = $1
           AND (status IS NULL OR status <> 'completed')
           AND completed_at IS NULL
           AND ($2::date IS NULL OR end_date > $2::date)
           AND ($3::date IS NULL OR start_date < $3::date)
         ORDER BY start_date ASC`,
        [Number(motorId), fromDate, toDate],
      );
      return res.rows.map((r) => ({
        from: toISODate(r.start_date),
        to: toISODate(r.end_date),
        startDate: toISODate(r.start_date),
        endDate: toISODate(r.end_date),
      }));
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findExpiredPending(thresholdIso, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `${BASE_BOOKING_SELECT}
         WHERE b.status = 'pending'
           AND (
             (b.expires_at IS NOT NULL AND b.expires_at < $1::timestamptz)
             OR (b.expires_at IS NULL AND b.created_at < $1::timestamptz)
           )
         ORDER BY b.created_at ASC`,
        [thresholdIso],
      );
      return res.rows.map((r) => mapBooking(r, r.items, r.timeline));
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(bookingData, client = null) {
    const db = client || pool;
    try {
      const {
        id,
        code,
        bookingCode,
        userId,
        motorId,
        motorcycleId,
        startDate,
        endDate,
        pickupTime = '09:00',
        pickupLocationId = null,
        pickupLocationText = '',
        delivery = {},
        renter = {},
        emergencyContact = {},
        notes = '',
        pricing = {},
        pricePerDay,
        subtotal,
        durationDiscount = 0,
        promoCodeId = null,
        promoDiscount = 0,
        addOnsTotal = 0,
        addonsTotal = 0,
        deliveryTotal = 0,
        rentalTotal,
        deposit = 0,
        grandTotal,
        total,
        status = 'pending',
        expiresAt = null,
      } = bookingData;

      const finalCode = (bookingCode || code || `BK-${Date.now()}`).toUpperCase();
      const finalUserId = Number(userId || renter.userId);
      const finalMotorId = Number(motorcycleId || motorId);

      const dStart = new Date(startDate);
      const dEnd = new Date(endDate);
      const finalDays = Math.max(1, Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)));

      const finalPpd = Number(pricePerDay || pricing.pricePerDay || 0);
      const surcharge = Number(bookingData.totalSurcharge || pricing.totalSurcharge || pricing.weekendSurcharge || 0);
      let finalSubtotal = Number(subtotal !== undefined ? subtotal : (pricing.subtotal ? pricing.subtotal + surcharge : finalPpd * finalDays + surcharge));
      if (surcharge > 0 && finalSubtotal === finalPpd * finalDays) {
        finalSubtotal += surcharge;
      }
      const finalDurDisc = Number(durationDiscount || pricing.durationDiscount || 0);
      const finalPromoDisc = Number(promoDiscount || pricing.promoDiscount || 0);
      const finalAddons = Number(addonsTotal || addOnsTotal || pricing.addonsTotal || 0);
      const finalDelivery = Number(deliveryTotal || pricing.deliveryTotal || 0);
      const finalRentalTotal = finalSubtotal - finalDurDisc - finalPromoDisc + finalAddons + finalDelivery;
      const finalDeposit = Number(deposit !== undefined ? deposit : (pricing.deposit || 0));
      const finalGrandTotal = finalRentalTotal + finalDeposit;

      const isDeliveryPickup = Boolean(delivery.pickup || bookingData.deliveryPickup);
      const isDeliveryDropoff = Boolean(delivery.dropoff || bookingData.deliveryDropoff);

      const renterName = renter.name || bookingData.renterName || 'Pelanggan';
      const renterPhone = renter.phone || bookingData.renterPhone || '';
      const renterEmail = renter.email || bookingData.renterEmail || '';
      const emName = emergencyContact.name || renter.emergencyContact?.name || bookingData.emergencyContactName || null;
      const emPhone = emergencyContact.phone || renter.emergencyContact?.phone || bookingData.emergencyContactPhone || null;
      const finalNotes = notes || renter.notes || bookingData.notes || '';
      const finalPolicySnapshot = bookingData.policySnapshot || bookingData.policy_snapshot
        ? JSON.stringify(bookingData.policySnapshot || bookingData.policy_snapshot)
        : null;
      const finalPricingSnapshot = bookingData.pricingSnapshot || bookingData.pricing_snapshot || bookingData.pricing
        ? JSON.stringify(bookingData.pricingSnapshot || bookingData.pricing_snapshot || bookingData.pricing)
        : null;
      const finalTermsVersion = Number.isInteger(bookingData.termsVersion)
        ? bookingData.termsVersion
        : (Number.isInteger(bookingData.terms_version) ? bookingData.terms_version : null);
      const finalRenterSnapshot = bookingData.renterSnapshot || bookingData.renter_snapshot
        ? JSON.stringify(bookingData.renterSnapshot || bookingData.renter_snapshot)
        : null;

      let query;
      let params;

      if (id !== undefined && id !== null) {
        query = `
          INSERT INTO bookings (
            id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, pickup_location_id, pickup_location_text,
            delivery_pickup, delivery_dropoff,
            renter_name, renter_phone, renter_email,
            emergency_contact_name, emergency_contact_phone, notes,
            status, expires_at, price_per_day, subtotal, duration_discount,
            promo_code_id, promo_discount, addons_total, delivery_total,
            rental_total, deposit, grand_total, policy_snapshot, pricing_snapshot, terms_version, renter_snapshot,
            payment_method, version, cancelled_by, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
            $35, $36, $37, now(), now()
          )
          RETURNING id`;
        params = [
          Number(id), finalCode, finalUserId, finalMotorId, startDate, endDate, finalDays,
          pickupTime, pickupLocationId ? Number(pickupLocationId) : null, pickupLocationText,
          isDeliveryPickup, isDeliveryDropoff,
          renterName, renterPhone, renterEmail, emName, emPhone, finalNotes,
          status, expiresAt, finalPpd, finalSubtotal, finalDurDisc,
          promoCodeId ? Number(promoCodeId) : null, finalPromoDisc, finalAddons, finalDelivery,
          finalRentalTotal, finalDeposit, finalGrandTotal, finalPolicySnapshot, finalPricingSnapshot, finalTermsVersion, finalRenterSnapshot,
          bookingData.paymentMethod || 'bank_transfer', Number(bookingData.version || 1), bookingData.cancelledBy || null,
        ];
      } else {
        query = `
          INSERT INTO bookings (
            booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
            pickup_time, pickup_location_id, pickup_location_text,
            delivery_pickup, delivery_dropoff,
            renter_name, renter_phone, renter_email,
            emergency_contact_name, emergency_contact_phone, notes,
            status, expires_at, price_per_day, subtotal, duration_discount,
            promo_code_id, promo_discount, addons_total, delivery_total,
            rental_total, deposit, grand_total, policy_snapshot, pricing_snapshot, terms_version, renter_snapshot,
            payment_method, version, cancelled_by, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
            $34, $35, $36, now(), now()
          )
          RETURNING id`;
        params = [
          finalCode, finalUserId, finalMotorId, startDate, endDate, finalDays,
          pickupTime, pickupLocationId ? Number(pickupLocationId) : null, pickupLocationText,
          isDeliveryPickup, isDeliveryDropoff,
          renterName, renterPhone, renterEmail, emName, emPhone, finalNotes,
          status, expiresAt, finalPpd, finalSubtotal, finalDurDisc,
          promoCodeId ? Number(promoCodeId) : null, finalPromoDisc, finalAddons, finalDelivery,
          finalRentalTotal, finalDeposit, finalGrandTotal, finalPolicySnapshot, finalPricingSnapshot, finalTermsVersion, finalRenterSnapshot,
          bookingData.paymentMethod || 'bank_transfer', Number(bookingData.version || 1), bookingData.cancelledBy || null,
        ];
      }

      const res = await db.query(query, params);
      const inserted = res.rows[0];

      // Simpan line items jika ada
      const rawItems = (Array.isArray(bookingData.lineItems) && bookingData.lineItems.length > 0)
        ? bookingData.lineItems
        : ((Array.isArray(pricing.lineItems) && pricing.lineItems.length > 0)
            ? pricing.lineItems
            : [
                { kind: 'rental', label: `Sewa Motor (${finalDays} hari)`, unitPrice: finalPpd, quantity: finalDays, days: finalDays, amount: finalSubtotal },
                ...(finalDeposit > 0 ? [{ kind: 'deposit', label: 'Deposit Jaminan', unitPrice: finalDeposit, quantity: 1, days: 1, amount: finalDeposit }] : []),
              ]);

      for (const item of rawItems) {
        const itemKind = ['rental', 'addon', 'delivery', 'discount_duration', 'discount_promo', 'deposit'].includes(item.kind || item.type)
          ? (item.kind || item.type)
          : 'rental';

        await db.query(
          `INSERT INTO booking_items (booking_id, kind, label, unit_price, quantity, days, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            inserted.id,
            itemKind,
            item.label || item.name || 'Item',
            Number(item.unitPrice || 0),
            Number(item.quantity || 1),
            Number(item.days || finalDays),
            Number(item.amount || 0),
          ],
        );
      }

      // Catat timeline awal
      await db.query(
        `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
         VALUES ($1, $2, 'Pemesanan baru berhasil dibuat', 'customer', now())`,
        [inserted.id, status],
      );

      const createdRecord = await this.findById(inserted.id, db);

      if (bookingData.idempotencyKey) {
        await db.query(
          `INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body)
           VALUES ($1, $2, $3, 201, $4)
           ON CONFLICT (user_id, key) DO UPDATE SET
             request_hash = EXCLUDED.request_hash,
             response_status = EXCLUDED.response_status,
             response_body = EXCLUDED.response_body`,
          [finalUserId, bookingData.idempotencyKey.trim(), bookingData.requestHash || '', JSON.stringify(createdRecord)],
        );
      }

      return createdRecord;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async update(id, patch, client = null) {
    if (id === null || id === undefined || isNaN(Number(id))) return null;
    const db = client || pool;
    try {
      const setClauses = [];
      const params = [Number(id)];

      const fieldMap = {
        status: 'status',
        cancelReason: 'cancel_reason',
        cancellationReason: 'cancel_reason',
        refundAmount: 'refund_amount',
        paidAt: 'paid_at',
        cancelledAt: 'cancelled_at',
        expiresAt: 'expires_at',
        paymentMethod: 'payment_method',
        cancelledBy: 'cancelled_by',
        version: 'version',
        handoverAt: 'handover_at',
        handedAt: 'handover_at',
        returnRequestedAt: 'return_requested_at',
        returnMethod: 'return_method',
        returnCustomerNotes: 'return_customer_notes',
        returnPhotoUrl: 'return_photo_url',
      };

      const assignedCols = new Set();
      for (const [key, col] of Object.entries(fieldMap)) {
        if (patch[key] !== undefined && !assignedCols.has(col)) {
          assignedCols.add(col);
          params.push(patch[key]);
          setClauses.push(`${col} = $${params.length}`);
        }
      }

      if (patch.policySnapshot !== undefined) {
        params.push(patch.policySnapshot ? JSON.stringify(patch.policySnapshot) : null);
        setClauses.push(`policy_snapshot = $${params.length}`);
      }

      if (patch.termsVersion !== undefined) {
        params.push(patch.termsVersion !== null ? Number(patch.termsVersion) : null);
        setClauses.push(`terms_version = $${params.length}`);
      }

      if (patch.paymentStatus === 'paid' && !patch.paidAt) {
        setClauses.push('paid_at = COALESCE(paid_at, now())');
      }

      if (setClauses.length > 0) {
        await db.query(
          `UPDATE bookings SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $1`,
          params,
        );
      }

      // Update / insert payment jika paymentMethod diberikan
      if (patch.paymentMethod) {
        const allowed = ['bank_transfer', 'ewallet', 'qris', 'cash'];
        const normalized = patch.paymentMethod === 'transfer'
          ? 'bank_transfer'
          : (allowed.includes(patch.paymentMethod) ? patch.paymentMethod : 'bank_transfer');

        const existingP = await db.query(
          'SELECT id FROM payments WHERE booking_id = $1 LIMIT 1',
          [Number(id)],
        );
        if (existingP.rows.length > 0) {
          await db.query(
            `UPDATE payments SET status = 'paid', method = $2, paid_at = COALESCE(paid_at, now()), updated_at = now()
             WHERE id = $1`,
            [existingP.rows[0].id, normalized],
          );
        } else {
          await db.query(
            `INSERT INTO payments (booking_id, amount, method, status, paid_at, created_at, updated_at)
             SELECT id, grand_total, $2, 'paid', COALESCE(paid_at, now()), now(), now()
             FROM bookings WHERE id = $1`,
            [Number(id), normalized],
          );
        }
      }

      // Catat timeline jika status berubah atau timeline eksplisit dioper
      if (Array.isArray(patch.timeline) && patch.timeline.length > 0) {
        const lastEntry = patch.timeline[patch.timeline.length - 1];
        const actor = ['customer', 'system', 'admin', 'payment', 'staff'].includes(lastEntry.actor)
          ? lastEntry.actor
          : 'system';
        await db.query(
          `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
           VALUES ($1, $2, $3, $4, now())`,
          [Number(id), lastEntry.status || patch.status || 'confirmed', lastEntry.note || '', actor],
        );
      } else if (patch.status) {
        await db.query(
          `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
           VALUES ($1, $2, $3, 'system', now())`,
          [Number(id), patch.status, patch.cancelReason || `Status diperbarui menjadi ${patch.status}`],
        );
      }

      return this.findById(id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async delete(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM bookings WHERE id = $1', [Number(id)]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = bookingRepo;
