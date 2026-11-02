const fs = require('fs');
const path = require('path');
const { pool } = require('../pool');
const logger = require('../../src/utils/logger');

const SEED_FILE = path.resolve(__dirname, '../../data/seed.json');

/**
 * Seeder data PostgreSQL dari data/seed.json ke 20 tabel skema publik RodaKita.
 *
 * @param {Pool} customPool - Instance pg pool opsional (untuk test database)
 */
async function loadSeed(customPool = null) {
  const targetPool = customPool || pool;
  const client = await targetPool.connect();

  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`File seed tidak ditemukan di: ${SEED_FILE}`);
  }

  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  try {
    await client.query('BEGIN');
    logger.info('[SEED] Memulai proses seeding 20 tabel database PostgreSQL...');

    // 1. Matikan trigger sementara agar import data bulk tidak terhalang validasi transisi bertahap
    await client.query('ALTER TABLE reviews DISABLE TRIGGER trg_reviews_sync_stats;');
    await client.query('ALTER TABLE bookings DISABLE TRIGGER trg_bookings_status_transition;');
    await client.query('ALTER TABLE booking_handovers DISABLE TRIGGER trg_check_handover_booking_status;');
    await client.query('ALTER TABLE booking_returns DISABLE TRIGGER trg_check_return_booking_status;');

    // 2. Bersihkan seluruh tabel dengan TRUNCATE CASCADE
    await client.query(`
      TRUNCATE TABLE
        gps_positions,
        gps_alerts,
        geofence_motorcycles,
        geofences,
        gps_access_log,
        gps_devices,
        payments,
        payment_events,
        reviews,
        favorites,
        contact_messages,
        idempotency_keys,
        promo_redemptions,
        booking_timeline,
        booking_items,
        booking_handovers,
        booking_returns,
        booking_notes,
        bookings,
        maintenance_blocks,
        motorcycle_features,
        motorcycle_images,
        motorcycles,
        addons,
        pickup_locations,
        promo_codes,
        user_documents,
        renter_profiles,
        users,
        audit_logs
      RESTART IDENTITY CASCADE;
    `);

    // 3. Seeding Users & User Documents
    for (const u of seed.users || []) {
      const userRes = await client.query(
        `INSERT INTO users (
           id, name, email, phone, password_hash, role,
           emergency_contact_name, emergency_contact_phone, is_active, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          u.id,
          u.name,
          u.email,
          u.phone,
          u.passwordHash,
          u.role || 'customer',
          u.emergencyContact?.name || null,
          u.emergencyContact?.phone || null,
          true,
          u.createdAt || new Date().toISOString(),
        ],
      );

      const userId = userRes.rows[0].id;

      // Seeding user_documents HANYA untuk status != 'not_uploaded'
      // Catatan: Status 'not_uploaded' diturunkan di mapper saat baris tidak ada
      if (u.documents) {
        for (const type of ['ktp', 'sim']) {
          const rawStatus = typeof u.documents[type] === 'object' ? u.documents[type].status : u.documents[type];
          if (rawStatus && rawStatus !== 'not_uploaded') {
            await client.query(
              `INSERT INTO user_documents (
                 user_id, type, stored_name, mime_type, size_bytes, status, uploaded_at, verified_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                userId,
                type,
                `${type}_user_${userId}.jpg`,
                'image/jpeg',
                245600,
                rawStatus,
                u.createdAt || new Date().toISOString(),
                rawStatus === 'verified' ? (u.createdAt || new Date().toISOString()) : null,
              ],
            );
          }
        }
      }
    }
    logger.info(`[SEED] Users: ${seed.users?.length || 0} baris dimasukkan.`);

    // 3b. Seeding Renter Profiles (Sumber Data Tunggal)
    for (const p of seed.renterProfiles || []) {
      await client.query(
        `INSERT INTO renter_profiles (
           user_id, full_name_ktp, birth_date, nik_hash, nik_last4,
           address_ktp, phone_e164, stay_address,
           emergency_name, emergency_relation, emergency_phone,
           terms_version_accepted, privacy_version_accepted, gps_consent_at,
           completed_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (user_id) DO UPDATE SET
           full_name_ktp = EXCLUDED.full_name_ktp,
           birth_date = EXCLUDED.birth_date,
           nik_hash = EXCLUDED.nik_hash,
           nik_last4 = EXCLUDED.nik_last4,
           address_ktp = EXCLUDED.address_ktp,
           phone_e164 = EXCLUDED.phone_e164,
           stay_address = EXCLUDED.stay_address,
           emergency_name = EXCLUDED.emergency_name,
           emergency_relation = EXCLUDED.emergency_relation,
           emergency_phone = EXCLUDED.emergency_phone,
           terms_version_accepted = EXCLUDED.terms_version_accepted,
           privacy_version_accepted = EXCLUDED.privacy_version_accepted,
           gps_consent_at = EXCLUDED.gps_consent_at,
           completed_at = EXCLUDED.completed_at,
           updated_at = now()`,
        [
          p.userId,
          p.fullNameKtp,
          p.birthDate,
          p.nikHash,
          p.nikLast4,
          p.addressKtp,
          p.phoneE164,
          p.stayAddress,
          p.emergencyName,
          p.emergencyRelation,
          p.emergencyPhone,
          p.termsVersionAccepted || 1,
          p.privacyVersionAccepted || 1,
          p.gpsConsentAt || new Date().toISOString(),
          p.completedAt || null,
          p.createdAt || new Date().toISOString(),
          p.updatedAt || new Date().toISOString(),
        ],
      );
    }
    logger.info(`[SEED] Renter Profiles: ${seed.renterProfiles?.length || 0} baris dimasukkan.`);

    // 4. Seeding Pickup Locations
    const locations = [
      { id: 1, name: 'Kantor Pusat RodaKita (Kuta)', address: 'Jl. Sunset Road No. 88, Kuta, Bali', is_active: true, sort_order: 1 },
      { id: 2, name: 'Bandara Internasional Ngurah Rai (DPS)', address: 'Pick-up Zone Terminal Kedatangan Domestik / Internasional', is_active: true, sort_order: 2 },
      { id: 3, name: 'Stasiun Kereta Api / Terminal Mengwi', address: 'Area Penjemputan Utama Terminal Mengwi Badung', is_active: true, sort_order: 3 },
      { id: 4, name: 'Hotel / Villa Area (Kuta, Seminyak, Canggu, Ubud)', address: 'Layanan Pengantaran ke Lobi Hotel / Villa Pelanggan', is_active: true, sort_order: 4 },
    ];
    for (const loc of locations) {
      await client.query(
        `INSERT INTO pickup_locations (id, name, address, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [loc.id, loc.name, loc.address, loc.is_active, loc.sort_order],
      );
    }
    logger.info(`[SEED] Pickup Locations: ${locations.length} baris dimasukkan.`);

    // 5. Seeding Addons
    const defaultAddons = [
      { id: 1, code: 'extra_helmet', name: 'Helm SNI Tambahan', price_per_day: 10000, is_active: true },
      { id: 2, code: 'raincoat', name: 'Jas Hujan Anti Bocor', price_per_day: 5000, is_active: true },
      { id: 3, code: 'phone_holder', name: 'Phone Holder Anti Getar', price_per_day: 5000, is_active: true },
    ];
    for (const addon of defaultAddons) {
      await client.query(
        `INSERT INTO addons (id, code, name, price_per_day, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
        [addon.id, addon.code, addon.name, addon.price_per_day, addon.is_active],
      );
    }
    logger.info(`[SEED] Addons: ${defaultAddons.length} baris dimasukkan.`);

    // 6. Seeding Motorcycles, Images, & Features
    for (const m of seed.motors || []) {
      const dbStatus = m.status === 'maintenance' ? 'maintenance' : (m.status === 'inactive' ? 'inactive' : 'active');
      const plateNumber = m.plate || `DK ${1000 + Number(m.id)} RK`;
      const ratingAvg = m.rating || 5.0;
      const reviewCount = m.reviewCount || 0;

      await client.query(
        `INSERT INTO motorcycles (
           id, slug, name, brand, type, cc, year, color, transmission, fuel_capacity,
           price_per_day, deposit, description, plate_number, status,
           rating_avg, rating_count, rating_1, rating_2, rating_3, rating_4, rating_5,
           rental_count, created_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15,
           $16, $17, $18, $19, $20, $21, $22,
           $23, now()
         )`,
        [
          m.id,
          m.slug,
          m.name,
          m.brand,
          m.type,
          m.cc,
          m.year,
          m.color || 'Hitam',
          m.transmission,
          m.fuelCapacity || 4.2,
          m.pricePerDay,
          m.deposit || 200000,
          m.description || '',
          plateNumber,
          dbStatus,
          ratingAvg,
          reviewCount,
          0, 0, 0, 0, reviewCount, // rating_1..rating_5
          m.popularity ? Math.round(m.popularity / 5) : 10,
        ],
      );

      // Motorcycle Images
      const images = Array.isArray(m.images) ? m.images : [];
      for (let i = 0; i < images.length; i++) {
        await client.query(
          `INSERT INTO motorcycle_images (motorcycle_id, url, position, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [m.id, images[i], i, i === 0],
        );
      }

      // Motorcycle Features
      const features = Array.isArray(m.features) ? m.features : [];
      for (const feat of features) {
        await client.query(
          `INSERT INTO motorcycle_features (motorcycle_id, feature)
           VALUES ($1, $2)
           ON CONFLICT (motorcycle_id, feature) DO NOTHING`,
          [m.id, feat],
        );
      }
    }
    logger.info(`[SEED] Motorcycles: ${seed.motors?.length || 0} unit motor dimasukkan.`);

    // 7. Seeding Maintenance Blocks
    for (const sb of seed.serviceBlocks || []) {
      await client.query(
        `INSERT INTO maintenance_blocks (id, motorcycle_id, start_date, end_date, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [
          sb.id,
          sb.motorId,
          sb.startDate,
          sb.endDate,
          sb.reason || 'Servis berkala',
        ],
      );
    }
    logger.info(`[SEED] Maintenance Blocks: ${seed.serviceBlocks?.length || 0} baris dimasukkan.`);

    // 8. Seeding Promo Codes
    for (const p of seed.promos || []) {
      await client.query(
        `INSERT INTO promo_codes (
           id, code, type, value, max_discount, min_days, weekend_only,
           valid_from, valid_until, usage_limit, used_count, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
          p.code.toUpperCase(),
          p.type,
          p.value,
          p.maxDiscount || null,
          p.minDays || 1,
          p.requiresWeekend || p.weekendOnly || false,
          p.validFrom || new Date().toISOString().slice(0, 10),
          p.validUntil,
          p.quota || null,
          Number(p.usedCount || 0),
          p.isActive !== false,
        ],
      );
    }
    logger.info(`[SEED] Promo Codes: ${seed.promos?.length || 0} baris dimasukkan.`);

    // 9. Seeding Bookings, Booking Items, Timeline & Payments
    for (const b of seed.bookings || []) {
      const days = Number(b.days || 1);
      const pricePerDay = Number(b.pricePerDay || 75000);
      const subtotal = Number(b.subtotal || pricePerDay * days);
      const durationDiscount = Number(b.durationDiscount || 0);
      const promoDiscount = Number(b.discount || 0);
      const addonsTotal = Number(b.addOnsTotal || 0);
      const deliveryTotal = Number(b.deliveryFee || 0);
      const rentalTotal = subtotal - durationDiscount - promoDiscount + addonsTotal + deliveryTotal;
      const deposit = Number(b.deposit || 200000);
      const grandTotal = rentalTotal + deposit;

      const renterName = b.renter?.name || 'Pelanggan RodaKita';
      const renterPhone = b.renter?.phone || '081234567890';
      const renterEmail = b.renter?.email || 'customer@rodakita.id';
      const notes = b.notes || b.renter?.notes || '';
      const isPaid = ['confirmed', 'active', 'completed'].includes(b.status);
      const paidAt = isPaid ? (b.createdAt || new Date().toISOString()) : null;

      await client.query(
        `INSERT INTO bookings (
           id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
           pickup_time, pickup_location_id, pickup_location_text, delivery_pickup, delivery_dropoff,
           renter_name, renter_phone, renter_email, emergency_contact_name, emergency_contact_phone,
           notes, status, price_per_day, subtotal, duration_discount, promo_code_id, promo_discount,
           addons_total, delivery_total, rental_total, deposit, grand_total, refund_amount,
           paid_at, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17,
           $18, $19, $20, $21, $22, $23, $24,
           $25, $26, $27, $28, $29, $30,
           $31, $32, $33
         )`,
        [
          b.id,
          b.code,
          b.userId,
          b.motorId,
          b.startDate,
          b.endDate,
          days,
          b.pickupTime || '09:00',
          1,
          'Kantor Pusat RodaKita',
          b.pickup === 'delivery',
          b.pickup === 'delivery',
          renterName,
          renterPhone,
          renterEmail,
          null,
          null,
          notes,
          b.status || 'pending',
          pricePerDay,
          subtotal,
          durationDiscount,
          null,
          promoDiscount,
          addonsTotal,
          deliveryTotal,
          rentalTotal,
          deposit,
          grandTotal,
          0,
          paidAt,
          b.createdAt || new Date().toISOString(),
          b.createdAt || new Date().toISOString(),
        ],
      );

      // Line Items (booking_items)
      await client.query(
        `INSERT INTO booking_items (booking_id, kind, label, unit_price, quantity, days, amount)
         VALUES ($1, 'rental', $2, $3, $4, $5, $6),
                ($1, 'deposit', 'Deposit Jaminan (Dapat Dikembalikan)', $7, 1, 1, $7)`,
        [
          b.id,
          `Sewa Motor (${days} hari)`,
          pricePerDay,
          days,
          days,
          subtotal,
          deposit,
        ],
      );

      // Booking Timeline
      await client.query(
        `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
         VALUES ($1, 'pending', 'Pemesanan baru berhasil dicatat', 'customer', $2)`,
        [b.id, b.createdAt || new Date().toISOString()],
      );

      if (isPaid) {
        await client.query(
          `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
           VALUES ($1, 'confirmed', 'Pembayaran berhasil dikonfirmasi', 'system', $2)`,
          [b.id, paidAt],
        );
      }

      // Payments
      await client.query(
        `INSERT INTO payments (booking_id, method, provider, status, amount, gateway_ref, paid_at, created_at)
         VALUES ($1, 'bank_transfer', 'simulation', $2, $3, $4, $5, $6)`,
        [
          b.id,
          isPaid ? 'paid' : 'pending',
          grandTotal,
          `SIM-${b.code}`,
          paidAt,
          b.createdAt || new Date().toISOString(),
        ],
      );

      // Handovers & Returns untuk booking active dan completed
      if (b.status === 'active' || b.status === 'completed') {
        await client.query(
          `INSERT INTO booking_handovers (
             booking_id, odometer_start, fuel_start, notes,
             documents_checked, deposit_received, handed_over_at, handed_over_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (booking_id) DO NOTHING`,
          [
            b.id,
            12000,
            'penuh',
            'Serah terima unit awal sewa lancar',
            true,
            true,
            b.createdAt || new Date().toISOString(),
            4,
          ],
        );

        await client.query(
          `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
           VALUES ($1, 'active', 'Unit diserah-terimakan ke penyewa', 'staff', $2)`,
          [b.id, b.createdAt || new Date().toISOString()],
        );
      }

      if (b.status === 'completed') {
        await client.query(
          `INSERT INTO booking_returns (
             booking_id, odometer_end, fuel_end, notes, returned_at,
             late_minutes, late_fee, damage_fee, other_fee,
             deposit_snapshot, deposit_refund, amount_due,
             deposit_refunded_at, deposit_refunded_by, received_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (booking_id) DO NOTHING`,
          [
            b.id,
            12150,
            'penuh',
            'Unit dikembalikan dalam kondisi mulus tanpa kendala',
            b.endDate ? `${b.endDate}T11:00:00.000Z` : new Date().toISOString(),
            0,
            0,
            0,
            0,
            deposit,
            deposit,
            0,
            b.endDate ? `${b.endDate}T11:05:00.000Z` : new Date().toISOString(),
            4,
            4,
          ],
        );

        await client.query(
          `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
           VALUES ($1, 'completed', 'Unit diterima kembali dan sewa selesai', 'staff', $2)`,
          [b.id, b.endDate ? `${b.endDate}T11:00:00.000Z` : new Date().toISOString()],
        );
      }
    }
    logger.info(`[SEED] Bookings, Items & Payments: ${seed.bookings?.length || 0} baris dimasukkan.`);

    // 10. Seeding Reviews
    // Catatan: reviews(booking_id UNIQUE FK) memerlukan booking_id yang sah dan unik
    for (const r of seed.reviews || []) {
      const histBookingId = 1000 + Number(r.id);
      const revDate = r.date ? new Date(r.date) : new Date();
      const startHist = new Date(revDate.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endHist = new Date(revDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Buat booking historis berstatus completed khusus untuk setiap ulasan
      await client.query(
        `INSERT INTO bookings (
           id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
           pickup_time, renter_name, renter_phone, renter_email, status,
           price_per_day, subtotal, duration_discount, promo_discount, addons_total,
           delivery_total, rental_total, deposit, grand_total, paid_at, created_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, 2,
           '09:00', $7, '081234567890', 'customer@rodakita.id', 'completed',
           75000, 150000, 0, 0, 0,
           0, 150000, 200000, 350000, $8, $8
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          histBookingId,
          `RK-HIST-${r.id}`,
          r.userId,
          r.motorId,
          startHist,
          endHist,
          r.userName || 'Pelanggan RodaKita',
          revDate.toISOString(),
        ],
      );

      // Tambahkan juga booking_items agar verifikasi line items konsisten
      await client.query(
        `INSERT INTO booking_items (booking_id, kind, label, unit_price, quantity, days, amount)
         VALUES ($1, 'rental', 'Sewa Motor (2 hari)', 75000, 2, 2, 150000)
         ON CONFLICT DO NOTHING`,
        [histBookingId],
      );

      // Handover & Return untuk booking historis completed
      await client.query(
        `INSERT INTO booking_handovers (
           booking_id, odometer_start, fuel_start, notes,
           documents_checked, deposit_received, handed_over_at, handed_over_by
         )
         VALUES ($1, 10000, 'penuh', 'Serah terima awal sewa historis', true, true, $2, 4)
         ON CONFLICT (booking_id) DO NOTHING`,
        [histBookingId, startHist],
      );

      await client.query(
        `INSERT INTO booking_returns (
           booking_id, odometer_end, fuel_end, notes, returned_at,
           late_minutes, late_fee, damage_fee, other_fee,
           deposit_snapshot, deposit_refund, amount_due,
           deposit_refunded_at, deposit_refunded_by, received_by
         )
         VALUES ($1, 10100, 'penuh', 'Sewa historis selesai', $2, 0, 0, 0, 0, 200000, 200000, 0, $2, 4, 4)
         ON CONFLICT (booking_id) DO NOTHING`,
        [histBookingId, endHist],
      );

      await client.query(
        `INSERT INTO reviews (id, booking_id, user_id, motorcycle_id, rating, comment, is_hidden, hidden_reason, hidden_at, hidden_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id,
          histBookingId,
          r.userId,
          r.motorId,
          r.rating,
          r.comment,
          Boolean(r.isHidden),
          r.hiddenReason || null,
          r.hiddenAt || null,
          r.hiddenBy || null,
          revDate.toISOString(),
        ],
      );
    }
    logger.info(`[SEED] Reviews: ${seed.reviews?.length || 0} baris dimasukkan.`);

    // 11. Seeding Favorites
    for (const f of seed.favorites || []) {
      await client.query(
        `INSERT INTO favorites (user_id, motorcycle_id, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, motorcycle_id) DO NOTHING`,
        [f.userId, f.motorId, f.createdAt || new Date().toISOString()],
      );
    }
    logger.info(`[SEED] Favorites: ${seed.favorites?.length || 0} baris dimasukkan.`);

    // 12. Seeding Contacts (contact_messages)
    for (const c of seed.contacts || []) {
      await client.query(
        `INSERT INTO contact_messages (id, name, email, subject, message, ip, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          c.id,
          c.name,
          c.email,
          c.subject || 'Pertanyaan Umum',
          c.message,
          '127.0.0.1',
          Boolean(c.isRead),
          c.createdAt || new Date().toISOString(),
        ],
      );
    }
    logger.info(`[SEED] Contact Messages: ${seed.contacts?.length || 0} baris dimasukkan.`);

    // 13. Seeding App Settings Default
    await client.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES
        ('minRentalDays', '1'::jsonb, now()),
        ('maxRentalDays', '30'::jsonb, now()),
        ('paymentExpiryMinutes', '60'::jsonb, now()),
        ('lateFeeToleranceMinutes', '120'::jsonb, now()),
        ('lateFeePercentPerHour', '10'::jsonb, now()),
        ('cancellationThresholdHours', '24'::jsonb, now()),
        ('cancellationRefundPercent', '50'::jsonb, now()),
        ('defaultDeposit', '200000'::jsonb, now())
      ON CONFLICT (key) DO NOTHING;
    `);

    // 14. Seeding Sample Audit Logs
    await client.query(`
      INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, after, at)
      VALUES
        (3, 'admin', 'SYSTEM_INITIALIZED', 'System', 'global', '{"version":"1.0.0"}'::jsonb, now() - interval '2 days'),
        (3, 'admin', 'LOAD_SEED_DATA', 'Database', 'seed', '{"tablesCount":25}'::jsonb, now() - interval '1 day'),
        (4, 'staff', 'VERIFY_DOCUMENT', 'Document', '1_ktp', '{"status":"verified"}'::jsonb, now() - interval '12 hours')
      ON CONFLICT DO NOTHING;
    `);

    // 15. Seeding Default Geofences & GPS Devices
    await client.query(`
      INSERT INTO geofences (id, name, type, geometry, applies_to, is_active)
      VALUES
        (1, 'Area Operasional Yogyakarta (DIY)', 'circle', '{"center":{"lat":-7.7829,"lng":110.3670},"radiusM":25000}'::jsonb, '"all"'::jsonb, true),
        (2, 'Zona Wisata Malioboro & Keraton', 'polygon', '{"coordinates":[[-7.7820,110.3650],[-7.7820,110.3700],[-7.8050,110.3700],[-7.8050,110.3650]]}'::jsonb, '"all"'::jsonb, true)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO gps_devices (id, motorcycle_id, provider, external_id, label, is_active, battery_pct, installed_at)
      VALUES
        (1, 1, 'simulator', 'GPS-SIM-VARIO-01', 'GPS Tracker Honda Vario 160', true, 95, now() - interval '30 days'),
        (2, 2, 'simulator', 'GPS-SIM-NMAX-02', 'GPS Tracker Yamaha NMAX 155', true, 88, now() - interval '30 days'),
        (3, 3, 'simulator', 'GPS-SIM-PCX-03', 'GPS Tracker Honda PCX 160', true, 92, now() - interval '30 days')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 16. Aktifkan kembali trigger
    await client.query('ALTER TABLE reviews ENABLE TRIGGER trg_reviews_sync_stats;');
    await client.query('ALTER TABLE bookings ENABLE TRIGGER trg_bookings_status_transition;');
    await client.query('ALTER TABLE booking_handovers ENABLE TRIGGER trg_check_handover_booking_status;');
    await client.query('ALTER TABLE booking_returns ENABLE TRIGGER trg_check_return_booking_status;');

    // 17. Sinkronkan statistik motor setelah review dimasukkan (hanya review tidak tersembunyi)
    await client.query(`
      UPDATE motorcycles m
      SET
        rating_avg = COALESCE(stats.avg_rating, 5.00),
        rating_count = COALESCE(stats.cnt, 0),
        rating_1 = COALESCE(stats.r1, 0),
        rating_2 = COALESCE(stats.r2, 0),
        rating_3 = COALESCE(stats.r3, 0),
        rating_4 = COALESCE(stats.r4, 0),
        rating_5 = COALESCE(stats.r5, 0)
      FROM (
        SELECT
          motorcycle_id,
          ROUND(AVG(rating)::numeric, 2) AS avg_rating,
          COUNT(*) AS cnt,
          COUNT(*) FILTER (WHERE rating = 1) AS r1,
          COUNT(*) FILTER (WHERE rating = 2) AS r2,
          COUNT(*) FILTER (WHERE rating = 3) AS r3,
          COUNT(*) FILTER (WHERE rating = 4) AS r4,
          COUNT(*) FILTER (WHERE rating = 5) AS r5
        FROM reviews
        WHERE is_hidden = false
        GROUP BY motorcycle_id
      ) stats
      WHERE m.id = stats.motorcycle_id;
    `);

    // 18. Reset Identity Sequences untuk SEMUA tabel ke MAX(id) + 1
    const tables = [
      'users',
      'user_documents',
      'motorcycles',
      'motorcycle_images',
      'maintenance_blocks',
      'pickup_locations',
      'addons',
      'promo_codes',
      'bookings',
      'booking_items',
      'booking_timeline',
      'booking_notes',
      'payments',
      'payment_events',
      'reviews',
      'contact_messages',
      'audit_logs',
      'geofences',
      'gps_devices',
      'gps_positions',
      'gps_alerts',
    ];

    for (const table of tables) {
      const seqRes = await client.query(`SELECT pg_get_serial_sequence('${table}', 'id') AS seq`);
      const seq = seqRes.rows[0]?.seq;
      if (seq) {
        await client.query(`
          SELECT setval(
            '${seq}',
            COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1,
            false
          );
        `);
      }
    }
    logger.info('[SEED] Seluruh sequence ID tabel berhasil di-reset ke MAX(id)+1.');

    await client.query('COMMIT');
    logger.info('[SEED] Seeding 20 tabel PostgreSQL berhasil diselesaikan secara sempurna.');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[SEED ERROR] Gagal melakukan seeding:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Eksekusi via CLI
if (require.main === module) {
  loadSeed()
    .then(() => {
      console.log('Seeding selesai.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  loadSeed,
};
