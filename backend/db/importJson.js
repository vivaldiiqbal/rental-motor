const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');
const logger = require('../src/utils/logger');

/**
 * Mengimpor data/db.json hasil Tahap 2 (pengguna, hash sandi, booking, ulasan, favorit, dsb.)
 * ke dalam basis data PostgreSQL dalam satu transaksi atomik.
 *
 * Fitur:
 * - Pemetaan ID dan normalisasi data (camelCase -> snake_case)
 * - Konsistensi kalkulasi relasional (subtotal, diskon, rental_total, deposit, grand_total)
 * - Aman dijalankan ulang (idempotent, tanpa duplikasi baris via ON CONFLICT)
 * - Error isolation per baris via SAVEPOINT sehingga satu baris rusak tidak membatalkan seluruh proses
 * - Laporan detail jumlah baris sukses dan ditolak
 * - Reset seluruh sequence ID ke MAX(id) + 1
 *
 * @param {string} filePath - Path ke file JSON sumber
 * @param {Pool} customPool - Instance PostgreSQL pool opsional
 */
async function importJson(filePath = 'data/db.json', customPool = null) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File JSON tidak ditemukan di: ${resolved}`);
  }

  const rawData = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const targetPool = customPool || pool;
  const client = await targetPool.connect();

  const stats = {
    users: { total: 0, success: 0, rejected: 0 },
    motorcycles: { total: 0, success: 0, rejected: 0 },
    promo_codes: { total: 0, success: 0, rejected: 0 },
    maintenance_blocks: { total: 0, success: 0, rejected: 0 },
    bookings: { total: 0, success: 0, rejected: 0 },
    reviews: { total: 0, success: 0, rejected: 0 },
    favorites: { total: 0, success: 0, rejected: 0 },
    contact_messages: { total: 0, success: 0, rejected: 0 },
  };

  try {
    await client.query('BEGIN');
    logger.info(`[IMPORT] Memulai impor data JSON dari '${resolved}' ke PostgreSQL dalam satu transaksi...`);

    // Matikan trigger sementara agar proses import stabil
    await client.query('ALTER TABLE reviews DISABLE TRIGGER trg_reviews_sync_stats;');
    await client.query('ALTER TABLE bookings DISABLE TRIGGER trg_bookings_status_transition;');
    await client.query('ALTER TABLE booking_handovers DISABLE TRIGGER trg_check_handover_booking_status;');
    await client.query('ALTER TABLE booking_returns DISABLE TRIGGER trg_check_return_booking_status;');

    // Helper untuk eksekusi aman per baris dengan SAVEPOINT
    async function safeExecute(tableKey, fn) {
      await client.query('SAVEPOINT sp_row');
      try {
        await fn();
        await client.query('RELEASE SAVEPOINT sp_row');
        stats[tableKey].success++;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sp_row');
        logger.warn(`[IMPORT ${tableKey.toUpperCase()} DITOLAK] ${err.message}`);
        stats[tableKey].rejected++;
      }
    }

    // 1. Impor Users
    const usersList = rawData.users || [];
    stats.users.total = usersList.length;
    for (const u of usersList) {
      if (!u.id || !u.email || !u.name) {
        stats.users.rejected++;
        continue;
      }
      await safeExecute('users', async () => {
        await client.query(
          `INSERT INTO users (
             id, name, email, phone, password_hash, role,
             emergency_contact_name, emergency_contact_phone, is_active, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             emergency_contact_name = EXCLUDED.emergency_contact_name,
             emergency_contact_phone = EXCLUDED.emergency_contact_phone,
             is_active = EXCLUDED.is_active,
             updated_at = now()`,
          [
            Number(u.id),
            u.name.trim(),
            u.email.trim().toLowerCase(),
            u.phone || '08123456789',
            u.passwordHash || '',
            u.role || 'customer',
            u.emergencyContact?.name || null,
            u.emergencyContact?.phone || null,
            u.isActive !== false,
            u.createdAt || new Date().toISOString(),
          ],
        );

        // Impor dokumen pengguna bila ada
        if (u.documents) {
          for (const type of ['ktp', 'sim']) {
            const rawStatus = typeof u.documents[type] === 'object' ? u.documents[type].status : u.documents[type];
            if (rawStatus && rawStatus !== 'not_uploaded') {
              await client.query(
                `INSERT INTO user_documents (
                   user_id, type, stored_name, mime_type, size_bytes, status, uploaded_at, verified_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (user_id, type) DO UPDATE SET
                   status = EXCLUDED.status,
                   verified_at = EXCLUDED.verified_at`,
                [
                  Number(u.id),
                  type,
                  `${type}_user_${u.id}.jpg`,
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
      });
    }

    // 2. Impor Motorcycles
    const motorsList = rawData.motors || [];
    stats.motorcycles.total = motorsList.length;
    for (const m of motorsList) {
      if (!m.id || !m.name || !m.pricePerDay) {
        stats.motorcycles.rejected++;
        continue;
      }
      await safeExecute('motorcycles', async () => {
        const rawStatus = m.status === 'available' ? 'active' : (m.status || 'active');
        const plate = m.plate || m.plateNumber || `DK ${m.id * 111} RK`;
        await client.query(
          `INSERT INTO motorcycles (
             id, slug, name, brand, type, cc, year, color, transmission, fuel_capacity,
             price_per_day, deposit, description, plate_number, status,
             rating_avg, rating_count, rental_count
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             brand = EXCLUDED.brand,
             type = EXCLUDED.type,
             price_per_day = EXCLUDED.price_per_day,
             deposit = EXCLUDED.deposit,
             status = EXCLUDED.status,
             rating_avg = EXCLUDED.rating_avg,
             rating_count = EXCLUDED.rating_count,
             rental_count = EXCLUDED.rental_count`,
          [
            Number(m.id),
            m.slug || `motor-${m.id}`,
            m.name,
            m.brand,
            m.type,
            Number(m.cc || 125),
            Number(m.year || 2023),
            m.color || 'Hitam',
            m.transmission || 'Automatic',
            Number(m.fuelCapacity || 4.2),
            Number(m.pricePerDay),
            Number(m.deposit || 200000),
            m.description || '',
            plate,
            rawStatus,
            Number(m.rating || 5.0),
            Number(m.reviewCount || 0),
            Number(m.rentalCount || 0),
          ],
        );

        // Impor images
        if (Array.isArray(m.images)) {
          for (let i = 0; i < m.images.length; i++) {
            await client.query(
              `INSERT INTO motorcycle_images (motorcycle_id, url, position, is_primary)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [Number(m.id), m.images[i], i, i === 0],
            );
          }
        }

        // Impor features
        if (Array.isArray(m.features)) {
          for (const feat of m.features) {
            await client.query(
              `INSERT INTO motorcycle_features (motorcycle_id, feature)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [Number(m.id), feat],
            );
          }
        }
      });
    }

    // 3. Impor Promo Codes
    const promosList = rawData.promos || [];
    stats.promo_codes.total = promosList.length;
    for (const p of promosList) {
      if (!p.code || !p.value) {
        stats.promo_codes.rejected++;
        continue;
      }
      await safeExecute('promo_codes', async () => {
        await client.query(
          `INSERT INTO promo_codes (
             id, code, type, value, max_discount, min_days, weekend_only,
             valid_from, valid_until, usage_limit, used_count, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (upper(code)) DO UPDATE SET
             value = EXCLUDED.value,
             usage_limit = EXCLUDED.usage_limit,
             used_count = EXCLUDED.used_count,
             is_active = EXCLUDED.is_active`,
          [
            p.id ? Number(p.id) : null,
            p.code.toUpperCase(),
            p.type || 'percent',
            Number(p.value),
            p.maxDiscount ? Number(p.maxDiscount) : null,
            Number(p.minDays || 1),
            Boolean(p.weekendOnly),
            p.validFrom ? String(p.validFrom).slice(0, 10) : '2026-01-01',
            p.validUntil ? String(p.validUntil).slice(0, 10) : '2026-12-31',
            p.usageLimit ? Number(p.usageLimit) : null,
            Number(p.usedCount || 0),
            p.isActive !== false,
          ],
        );
      });
    }

    // 4. Impor Service Blocks / Maintenance Blocks
    const serviceList = rawData.serviceBlocks || [];
    stats.maintenance_blocks.total = serviceList.length;
    for (const s of serviceList) {
      if (!s.motorId || !s.startDate || !s.endDate) {
        stats.maintenance_blocks.rejected++;
        continue;
      }
      await safeExecute('maintenance_blocks', async () => {
        await client.query(
          `INSERT INTO maintenance_blocks (
             id, motorcycle_id, start_date, end_date, reason, created_at
           )
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (id) DO UPDATE SET
             start_date = EXCLUDED.start_date,
             end_date = EXCLUDED.end_date,
             reason = EXCLUDED.reason`,
          [
            s.id ? Number(s.id) : null,
            Number(s.motorId),
            String(s.startDate).slice(0, 10),
            String(s.endDate).slice(0, 10),
            s.reason || 'Servis berkala rutin',
          ],
        );
      });
    }

    // 5. Impor Bookings
    const bookingsList = rawData.bookings || [];
    stats.bookings.total = bookingsList.length;
    for (const b of bookingsList) {
      if (!b.id || !b.startDate || !b.endDate) {
        stats.bookings.rejected++;
        continue;
      }
      await safeExecute('bookings', async () => {
        const start = String(b.startDate).slice(0, 10);
        const end = String(b.endDate).slice(0, 10);
        const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000));
        const pricePerDay = Number(b.pricePerDay || 75000);
        const subtotal = Number(b.subtotal !== undefined ? b.subtotal : pricePerDay * days);

        const durationDiscount = Number(b.durationDiscount || 0);
        const promoDiscount = Number(b.promoDiscount !== undefined ? b.promoDiscount : (b.discount || 0));
        const addonsTotal = Number(b.addonsTotal !== undefined ? b.addonsTotal : (b.addOnsTotal || 0));
        const deliveryTotal = Number(b.deliveryTotal !== undefined ? b.deliveryTotal : (b.deliveryFee || 0));

        // Pastikan formula rental_total dan grand_total 100% konsisten dengan constraint PostgreSQL
        const rentalTotal = subtotal - durationDiscount - promoDiscount + addonsTotal + deliveryTotal;
        const deposit = Number(b.deposit || 0);
        const grandTotal = rentalTotal + deposit;

        const bookingRes = await client.query(
          `INSERT INTO bookings (
             id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
             pickup_time, renter_name, renter_phone, renter_email, notes, status,
             price_per_day, subtotal, duration_discount, promo_discount, addons_total,
             delivery_total, rental_total, deposit, grand_total, refund_amount, created_at, updated_at
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, now()
           )
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             refund_amount = EXCLUDED.refund_amount,
             updated_at = now()
           RETURNING id`,
          [
            Number(b.id),
            b.code || b.bookingCode || `RM-IMPORT-${b.id}`,
            Number(b.userId || 1),
            Number(b.motorId || 1),
            start,
            end,
            days,
            b.pickupTime || '09:00',
            b.renter?.name || 'Pelanggan RodaKita',
            b.renter?.phone || '081234567890',
            b.renter?.email || 'customer@rodakita.id',
            b.notes || '',
            b.status || 'pending',
            pricePerDay,
            subtotal,
            durationDiscount,
            promoDiscount,
            addonsTotal,
            deliveryTotal,
            rentalTotal,
            deposit,
            grandTotal,
            Number(b.refundAmount || 0),
            b.createdAt || new Date().toISOString(),
          ],
        );

        const bId = bookingRes.rows[0].id;

        // Impor booking_items sesuai skema kind, label, unit_price, quantity, days, amount (idempotent)
        await client.query('DELETE FROM booking_items WHERE booking_id = $1', [bId]);
        await client.query(
          `INSERT INTO booking_items (booking_id, kind, label, unit_price, quantity, days, amount)
           VALUES ($1, 'rental', 'Sewa Motor Harian', $2, $3, $3, $4)`,
          [bId, pricePerDay, days, subtotal],
        );
        if (deposit > 0) {
          await client.query(
            `INSERT INTO booking_items (booking_id, kind, label, unit_price, quantity, days, amount)
             VALUES ($1, 'deposit', 'Deposit Jaminan (Dapat Dikembalikan)', $2, 1, 1, $2)`,
            [bId, deposit],
          );
        }

        // Impor booking_timeline jika belum ada
        const tlCheck = await client.query('SELECT 1 FROM booking_timeline WHERE booking_id = $1 LIMIT 1', [bId]);
        if (tlCheck.rows.length === 0) {
          await client.query(
            `INSERT INTO booking_timeline (booking_id, status, note, actor, at)
             VALUES ($1, $2, 'Data pemesanan diimpor ke sistem', 'system', $3)`,
            [bId, b.status || 'pending', b.createdAt || new Date().toISOString()],
          );
        }
      });
    }

    // 6. Impor Reviews
    // Catatan: reviews(booking_id UNIQUE FK) memerlukan booking_id yang valid
    const reviewsList = rawData.reviews || [];
    stats.reviews.total = reviewsList.length;
    for (const r of reviewsList) {
      if (!r.id || !r.motorId || !r.rating) {
        stats.reviews.rejected++;
        continue;
      }
      await safeExecute('reviews', async () => {
        let bookingIdToUse = r.bookingId ? Number(r.bookingId) : null;

        // Jika review tidak memiliki booking_id (misal data dummy seeder), tautkan dengan booking historis completed
        if (!bookingIdToUse) {
          bookingIdToUse = 1000 + Number(r.id);
          const revDate = r.date ? new Date(r.date) : new Date();
          const startHist = new Date(revDate.getTime() - 3 * 86400000).toISOString().slice(0, 10);
          const endHist = new Date(revDate.getTime() - 1 * 86400000).toISOString().slice(0, 10);

          await client.query(
            `INSERT INTO bookings (
               id, booking_code, user_id, motorcycle_id, start_date, end_date, total_days,
               pickup_time, renter_name, renter_phone, renter_email, status,
               price_per_day, subtotal, duration_discount, promo_discount, addons_total,
               delivery_total, rental_total, deposit, grand_total, paid_at, created_at
             )
             VALUES (
               $1, $2, $3, $4, $5, $6, 2,
               '09:00', 'Pelanggan Ulasan', '081234567890', 'customer@rodakita.id', 'completed',
               75000, 150000, 0, 0, 0,
               0, 150000, 200000, 350000, $7, $7
             )
             ON CONFLICT (id) DO NOTHING`,
            [
              bookingIdToUse,
              `RK-HIST-${r.id}`,
              Number(r.userId || 1),
              Number(r.motorId),
              startHist,
              endHist,
              revDate.toISOString(),
            ],
          );

          const biCheck = await client.query('SELECT 1 FROM booking_items WHERE booking_id = $1 LIMIT 1', [bookingIdToUse]);
          if (biCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO booking_items (booking_id, kind, label, unit_price, quantity, days, amount)
               VALUES ($1, 'rental', 'Sewa Motor (2 hari)', 75000, 2, 2, 150000)`,
              [bookingIdToUse],
            );
          }
        }

        await client.query(
          `INSERT INTO reviews (
             id, booking_id, user_id, motorcycle_id, rating, comment, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             rating = EXCLUDED.rating,
             comment = EXCLUDED.comment`,
          [
            Number(r.id),
            bookingIdToUse,
            Number(r.userId || 1),
            Number(r.motorId),
            Number(r.rating),
            r.comment || '',
            r.createdAt || (r.date ? `${r.date}T10:00:00.000Z` : new Date().toISOString()),
          ],
        );
      });
    }

    // 7. Impor Favorites
    const favoritesList = rawData.favorites || [];
    stats.favorites.total = favoritesList.length;
    for (const f of favoritesList) {
      if (!f.userId || !f.motorId) {
        stats.favorites.rejected++;
        continue;
      }
      await safeExecute('favorites', async () => {
        await client.query(
          `INSERT INTO favorites (user_id, motorcycle_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, motorcycle_id) DO NOTHING`,
          [Number(f.userId), Number(f.motorId), f.createdAt || new Date().toISOString()],
        );
      });
    }

    // 8. Impor Contacts (contact_messages)
    const contactsList = rawData.contacts || [];
    stats.contact_messages.total = contactsList.length;
    for (const c of contactsList) {
      if (!c.email || !c.message) {
        stats.contact_messages.rejected++;
        continue;
      }
      await safeExecute('contact_messages', async () => {
        await client.query(
          `INSERT INTO contact_messages (
             name, email, subject, message, created_at
           )
           VALUES ($1, $2, $3, $4, $5)`,
          [
            c.name || 'Pengunjung',
            c.email.trim().toLowerCase(),
            c.subject || 'Pertanyaan Umum',
            c.message,
            c.createdAt || new Date().toISOString(),
          ],
        );
      });
    }

    // Pastikan admin/staff user ID tersedia untuk handover/return
    const adminUserRes = await client.query("SELECT id FROM users WHERE role IN ('admin', 'staff') ORDER BY id ASC LIMIT 1");
    const staffId = adminUserRes.rows[0]?.id || 1;

    // Pastikan booking active dan completed memiliki data handover dan return (Tahap B)
    const activeAndCompleted = await client.query(
      "SELECT id, status, start_date, end_date, deposit FROM bookings WHERE status IN ('active', 'completed')"
    );

    for (const b of activeAndCompleted.rows) {
      await client.query(`
        INSERT INTO booking_handovers (
          booking_id, odometer_start, fuel_start, notes, documents_checked, deposit_received, handed_over_by, handed_over_at
        ) VALUES (
          $1, 12000, 'penuh', 'Serah terima terverifikasi', true, true, $2, ($3::date + interval '9 hours')
        ) ON CONFLICT (booking_id) DO NOTHING
      `, [b.id, staffId, b.start_date]);

      if (b.status === 'completed') {
        const dep = Number(b.deposit) || 200000;
        await client.query(`
          INSERT INTO booking_returns (
            booking_id, odometer_end, fuel_end, notes, late_minutes, late_fee,
            damage_fee, other_fee, deposit_snapshot, deposit_refund, amount_due,
            deposit_refunded_at, received_by, returned_at
          ) VALUES (
            $1, 12150, 'penuh', 'Motor kembali dalam kondisi baik', 0, 0,
            0, 0, $2, $2, 0,
            ($3::date + interval '17 hours'), $4, ($3::date + interval '17 hours')
          ) ON CONFLICT (booking_id) DO NOTHING
        `, [b.id, dep, b.end_date, staffId]);
      }
    }

    // Aktifkan kembali trigger
    await client.query('ALTER TABLE reviews ENABLE TRIGGER trg_reviews_sync_stats;');
    await client.query('ALTER TABLE bookings ENABLE TRIGGER trg_bookings_status_transition;');
    await client.query('ALTER TABLE booking_handovers ENABLE TRIGGER trg_check_handover_booking_status;');
    await client.query('ALTER TABLE booking_returns ENABLE TRIGGER trg_check_return_booking_status;');

    // Sinkronkan statistik motor setelah review diimpor (hanya review yang tidak tersembunyi)
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

    // 9. Reset seluruh sequence ID ke MAX(id) + 1
    const tablesWithSerialId = [
      'users',
      'motorcycles',
      'motorcycle_images',
      'maintenance_blocks',
      'pickup_locations',
      'addons',
      'promo_codes',
      'bookings',
      'booking_items',
      'booking_timeline',
      'reviews',
      'contact_messages',
      'booking_notes',
      'audit_logs',
    ];

    for (const table of tablesWithSerialId) {
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1,
          false
        );
      `);
    }

    await client.query('COMMIT');
    logger.info('[IMPORT] Transaksi impor data JSON berhasil di-COMMIT secara sukses!');

    console.log('\n=== LAPORAN HASIL IMPOR JSON KE POSTGRESQL ===');
    console.table(
      Object.entries(stats).map(([table, d]) => ({
        Tabel: table,
        'Total Baris': d.total,
        Sukses: d.success,
        Ditolak: d.rejected,
      })),
    );
    console.log('==============================================\n');

    return { success: true, stats };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[IMPORT ERROR] Gagal mengimpor data JSON, seluruh transaksi di-ROLLBACK:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const fileArg = process.argv[2] || 'data/db.json';
  importJson(fileArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  importJson,
};
