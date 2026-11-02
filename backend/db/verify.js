const { pool } = require('./pool');
const logger = require('../src/utils/logger');

/**
 * Memverifikasi integritas database PostgreSQL secara menyeluruh:
 * 1. Ekstensi (btree_gist, pg_trgm) dan 20 tabel skema publik
 * 2. Tidak ada booking aktif yang beririsan (no double booking)
 * 3. total_days dan total harga konsisten (rental_total, grand_total, date difference)
 * 4. booking_items sesuai total subtotal/addons
 * 5. used_count promo = jumlah redemption belum dilepas
 * 6. rating_avg dan rating_count sesuai tabel reviews (recalcRatings)
 * 7. Tidak ada baris yatim (orphan foreign key references)
 * 8. Semua sequence >= MAX(id)
 * 9. Tidak ada payment pending ganda per booking
 *
 * Exit code 0 jika lolos, exit code non-nol (1) bila ada temuan.
 */
async function verifyDatabase(customPool = null) {
  const targetPool = customPool || pool;
  const client = await targetPool.connect();

  let issuesCount = 0;

  try {
    console.log('\n=== VERIFIKASI INTEGRITAS DATABASE POSTGRESQL (20 TABEL) ===\n');

    // 1. Cek Ekstensi
    const extRes = await client.query('SELECT extname FROM pg_extension ORDER BY extname');
    const extensions = extRes.rows.map((r) => r.extname);
    console.log('1. Ekstensi Aktif:', extensions.join(', '));
    const hasBtreeGist = extensions.includes('btree_gist');
    const hasTrgm = extensions.includes('pg_trgm');
    console.log(`   - btree_gist : ${hasBtreeGist ? 'OK' : 'MISSING'}`);
    console.log(`   - pg_trgm    : ${hasTrgm ? 'OK' : 'MISSING'}`);
    if (!hasBtreeGist || !hasTrgm) issuesCount++;

    // 2. Cek 25 Tabel Skema Database
    const tables = [
      'users',
      'user_documents',
      'motorcycles',
      'motorcycle_images',
      'motorcycle_features',
      'maintenance_blocks',
      'pickup_locations',
      'addons',
      'promo_codes',
      'bookings',
      'booking_items',
      'booking_timeline',
      'booking_handovers',
      'booking_returns',
      'booking_notes',
      'promo_redemptions',
      'payments',
      'payment_events',
      'reviews',
      'favorites',
      'contact_messages',
      'idempotency_keys',
      'app_settings',
      'audit_logs',
      'schema_migrations',
      'gps_devices',
      'gps_positions',
      'geofences',
      'geofence_motorcycles',
      'gps_alerts',
      'gps_access_log',
    ];

    console.log('\n2. Tabel & Jumlah Baris (31 Tabel Termasuk GPS):');
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      try {
        const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
        const cnt = countRes.rows[0].cnt;
        console.log(`   ${String(i + 1).padStart(2)}. ${table.padEnd(22)}: ${String(cnt).padStart(4)} baris`);
      } catch (err) {
        console.log(`   ${String(i + 1).padStart(2)}. ${table.padEnd(22)}: ERROR (${err.message})`);
        issuesCount++;
      }
    }

    // 3. Cek Booking Aktif Beririsan
    console.log('\n3. Pengecekan Irisan Booking Aktif (No Double Booking):');
    const overlapRes = await client.query(`
      SELECT b1.id AS id1, b2.id AS id2, b1.booking_code AS code1, b2.booking_code AS code2, b1.motorcycle_id
      FROM bookings b1
      JOIN bookings b2 ON b1.motorcycle_id = b2.motorcycle_id AND b1.id < b2.id
      WHERE b1.status IN ('pending', 'confirmed', 'active')
        AND b2.status IN ('pending', 'confirmed', 'active')
        AND daterange(b1.start_date, b1.end_date, '[)') && daterange(b2.start_date, b2.end_date, '[)')
    `);
    if (overlapRes.rows.length === 0) {
      console.log('   - Bebas irisan: Tidak ada jadwal booking aktif yang bertabrakan. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${overlapRes.rows.length} pasang booking aktif yang beririsan!`);
      overlapRes.rows.forEach((r) => {
        console.error(`     * Booking #${r.id1} (${r.code1}) bertabrakan dengan #${r.id2} (${r.code2}) pada motor ID ${r.motorcycle_id}`);
      });
      issuesCount += overlapRes.rows.length;
    }

    // 4. Cek Konsistensi Durasi & Total Harga
    console.log('\n4. Konsistensi Durasi Hari & Total Harga Pemesanan:');
    const priceCheckRes = await client.query(`
      SELECT id, booking_code, total_days, (end_date - start_date) AS diff_days,
             rental_total, (subtotal - duration_discount - promo_discount + addons_total + delivery_total) AS exp_rental,
             grand_total, (rental_total + deposit) AS exp_grand
      FROM bookings
      WHERE total_days <> (end_date - start_date)
         OR grand_total <> (rental_total + deposit)
         OR rental_total <> (subtotal - duration_discount - promo_discount + addons_total + delivery_total)
    `);
    if (priceCheckRes.rows.length === 0) {
      console.log('   - Seluruh total_days, rental_total, dan grand_total pada bookings 100% konsisten. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${priceCheckRes.rows.length} baris booking dengan kalkulasi inkonsisten!`);
      priceCheckRes.rows.forEach((r) => {
        console.error(`     * Booking #${r.id} (${r.booking_code}): days=${r.total_days} (expected ${r.diff_days}), grand=${r.grand_total} (expected ${r.exp_grand})`);
      });
      issuesCount += priceCheckRes.rows.length;
    }

    // 5. Cek Kesesuaian Booking Items dengan Subtotal
    console.log('\n5. Kesesuaian Rincian Item (booking_items) terhadap Subtotal:');
    const itemsCheckRes = await client.query(`
      SELECT b.id, b.booking_code, b.subtotal,
             COALESCE(SUM(bi.amount) FILTER (WHERE bi.kind = 'rental'), 0)::int AS items_rental
      FROM bookings b
      JOIN booking_items bi ON b.id = bi.booking_id
      GROUP BY b.id
      HAVING b.subtotal > 0 AND b.subtotal <> COALESCE(SUM(bi.amount) FILTER (WHERE bi.kind = 'rental'), 0)::int
    `);
    if (itemsCheckRes.rows.length === 0) {
      console.log('   - Seluruh rincian booking_items sewa sesuai dengan subtotal pemesanan. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${itemsCheckRes.rows.length} booking dengan item sewa yang tidak sesuai subtotal!`);
      itemsCheckRes.rows.forEach((r) => {
        console.error(`     * Booking #${r.id} (${r.booking_code}): subtotal=${r.subtotal}, items=${r.items_rental}`);
      });
      issuesCount += itemsCheckRes.rows.length;
    }

    // 6. Cek Promo used_count = Jumlah Redemption Aktif (belum dilepas)
    console.log('\n6. Konsistensi used_count Kode Promo terhadap promo_redemptions:');
    const promoCheckRes = await client.query(`
      SELECT p.id, p.code, p.used_count,
             COALESCE(COUNT(r.booking_id)::int, 0) AS active_redemptions
      FROM promo_codes p
      LEFT JOIN promo_redemptions r ON p.id = r.promo_id AND r.released_at IS NULL
      GROUP BY p.id
      HAVING p.used_count <> COALESCE(COUNT(r.booking_id)::int, 0)
    `);
    if (promoCheckRes.rows.length === 0) {
      console.log('   - used_count pada seluruh promo_codes sesuai dengan jumlah redemption aktif. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${promoCheckRes.rows.length} promo_codes dengan used_count tidak sinkron!`);
      promoCheckRes.rows.forEach((r) => {
        console.error(`     * Promo '${r.code}': used_count=${r.used_count}, redemption aktif=${r.active_redemptions}`);
      });
      issuesCount += promoCheckRes.rows.length;
    }

    // 7. Cek Rating Avg & Rating Count Motor terhadap Tabel Reviews (Hanya Ulasan Tidak Tersembunyi)
    console.log('\n7. Verifikasi Kesesuaian Agregat Rating Motor (Hanya Ulasan Tidak Tersembunyi):');
    const ratingCheckRes = await client.query(`
      SELECT m.id, m.name, m.rating_avg, m.rating_count,
             COALESCE(ROUND(AVG(r.rating)::numeric, 2), 5.00) AS actual_avg,
             COUNT(r.id)::int AS actual_count
      FROM motorcycles m
      LEFT JOIN reviews r ON m.id = r.motorcycle_id AND r.is_hidden = false
      GROUP BY m.id
      HAVING (COUNT(r.id) > 0 AND (m.rating_avg <> ROUND(AVG(r.rating)::numeric, 2) OR m.rating_count <> COUNT(r.id)::int))
          OR (COUNT(r.id) = 0 AND m.rating_count <> 0)
    `);
    if (ratingCheckRes.rows.length === 0) {
      console.log('   - Seluruh agregat rating & review_count motor 100% konsisten dengan ulasan aktif. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${ratingCheckRes.rows.length} motor dengan ketidaksesuaian rating!`);
      ratingCheckRes.rows.forEach((r) => {
        console.error(`     * Motor ${r.id} (${r.name}): DB avg=${r.rating_avg}, actual avg=${r.actual_avg}; DB count=${r.rating_count}, actual count=${r.actual_count}`);
      });
      issuesCount += ratingCheckRes.rows.length;
    }

    // 8. Cek Baris Yatim (Orphan Rows)
    console.log('\n8. Pengecekan Baris Yatim (Orphan Foreign Key References):');
    const orphanChecks = [
      { name: 'user_documents -> users', sql: 'SELECT COUNT(*)::int AS cnt FROM user_documents WHERE user_id NOT IN (SELECT id FROM users)' },
      { name: 'bookings -> users', sql: 'SELECT COUNT(*)::int AS cnt FROM bookings WHERE user_id NOT IN (SELECT id FROM users)' },
      { name: 'bookings -> motorcycles', sql: 'SELECT COUNT(*)::int AS cnt FROM bookings WHERE motorcycle_id NOT IN (SELECT id FROM motorcycles)' },
      { name: 'payments -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM payments WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'reviews -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM reviews WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'reviews -> motorcycles', sql: 'SELECT COUNT(*)::int AS cnt FROM reviews WHERE motorcycle_id NOT IN (SELECT id FROM motorcycles)' },
      { name: 'favorites -> users', sql: 'SELECT COUNT(*)::int AS cnt FROM favorites WHERE user_id NOT IN (SELECT id FROM users)' },
      { name: 'favorites -> motorcycles', sql: 'SELECT COUNT(*)::int AS cnt FROM favorites WHERE motorcycle_id NOT IN (SELECT id FROM motorcycles)' },
      { name: 'booking_items -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM booking_items WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'booking_timeline -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM booking_timeline WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'booking_handovers -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM booking_handovers WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'booking_returns -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM booking_returns WHERE booking_id NOT IN (SELECT id FROM bookings)' },
      { name: 'booking_notes -> bookings', sql: 'SELECT COUNT(*)::int AS cnt FROM booking_notes WHERE booking_id NOT IN (SELECT id FROM bookings)' },
    ];

    let orphanCount = 0;
    for (const check of orphanChecks) {
      const res = await client.query(check.sql);
      const cnt = res.rows[0]?.cnt || 0;
      if (cnt > 0) {
        console.error(`   - DITEMUKAN BARIS YATIM pada relasi ${check.name}: ${cnt} baris`);
        orphanCount += cnt;
      }
    }
    if (orphanCount === 0) {
      console.log('   - Seluruh relasi Foreign Key bersih dari baris yatim. (OK)');
    } else {
      issuesCount += orphanCount;
    }

    // 9. Cek Sequence ID (Sequence >= MAX(id))
    console.log('\n9. Pengecekan Nilai Sequence ID (Sequence >= MAX(id)):');
    const serialTables = [
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
      'booking_notes',
      'payments',
      'reviews',
      'contact_messages',
      'audit_logs',
    ];

    let seqIssues = 0;
    for (const tbl of serialTables) {
      try {
        const seqNameRes = await client.query(`SELECT pg_get_serial_sequence('${tbl}', 'id') AS seq`);
        const seqName = seqNameRes.rows[0]?.seq;
        if (seqName) {
          const seqValRes = await client.query(`SELECT last_value FROM ${seqName}`);
          const maxIdRes = await client.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${tbl}`);
          const seq_val = Number(seqValRes.rows[0]?.last_value || 0);
          const max_id = Number(maxIdRes.rows[0]?.max_id || 0);
          if (seq_val < max_id) {
            console.error(`   - PELANGGARAN SEQUENCE: Tabel ${tbl} sequence (${seq_val}) < MAX(id) (${max_id})!`);
            seqIssues++;
          }
        }
      } catch (e) {
        console.error(`   - Error memeriksa sequence tabel ${tbl}:`, e.message);
        seqIssues++;
      }
    }
    if (seqIssues === 0) {
      console.log('   - Seluruh sequence ID tabel berada pada posisi aman (>= MAX(id)). (OK)');
    } else {
      issuesCount += seqIssues;
    }

    // 10. Cek Tidak Ada Payment Pending Ganda per Booking
    console.log('\n10. Pengecekan Pembayaran Pending Ganda (Satu Pending per Booking):');
    const doublePendingRes = await client.query(`
      SELECT booking_id, COUNT(*)::int AS pending_count
      FROM payments
      WHERE status = 'pending'
      GROUP BY booking_id
      HAVING COUNT(*) > 1
    `);
    if (doublePendingRes.rows.length === 0) {
      console.log('   - Tidak ada pembayaran berstatus pending ganda untuk booking yang sama. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${doublePendingRes.rows.length} booking dengan >1 payment pending!`);
      doublePendingRes.rows.forEach((r) => {
        console.error(`     * Booking #${r.booking_id} memiliki ${r.pending_count} pembayaran pending.`);
      });
      issuesCount += doublePendingRes.rows.length;
    }

    // 11. Cek Handover & Return: Booking active/completed punya handover, completed punya return
    console.log('\n11. Kelengkapan Handover & Return untuk Booking Active/Completed:');
    const missingHandoverRes = await client.query(`
      SELECT id, booking_code, status
      FROM bookings
      WHERE status IN ('active', 'completed')
        AND id NOT IN (SELECT booking_id FROM booking_handovers)
    `);
    const missingReturnRes = await client.query(`
      SELECT id, booking_code, status
      FROM bookings
      WHERE status = 'completed'
        AND id NOT IN (SELECT booking_id FROM booking_returns)
    `);
    if (missingHandoverRes.rows.length === 0 && missingReturnRes.rows.length === 0) {
      console.log('   - Seluruh booking active/completed memiliki handover dan completed memiliki return. (OK)');
    } else {
      if (missingHandoverRes.rows.length > 0) {
        console.error(`   - PELANGGARAN: Ditemukan ${missingHandoverRes.rows.length} booking active/completed tanpa handover!`);
        missingHandoverRes.rows.forEach((r) => console.error(`     * Booking #${r.id} (${r.booking_code}) status: ${r.status}`));
        issuesCount += missingHandoverRes.rows.length;
      }
      if (missingReturnRes.rows.length > 0) {
        console.error(`   - PELANGGARAN: Ditemukan ${missingReturnRes.rows.length} booking completed tanpa return!`);
        missingReturnRes.rows.forEach((r) => console.error(`     * Booking #${r.id} (${r.booking_code})`));
        issuesCount += missingReturnRes.rows.length;
      }
    }

    // 12. Cek Konsistensi Angka Return dengan Booking
    console.log('\n12. Konsistensi Angka Perhitungan Pengembalian (Return):');
    const returnCheckRes = await client.query(`
      SELECT br.booking_id, br.deposit_snapshot, b.deposit,
             br.deposit_refund, br.amount_due,
             (br.late_fee + br.damage_fee + br.other_fee) AS total_deductions
      FROM booking_returns br
      JOIN bookings b ON br.booking_id = b.id
      WHERE br.deposit_snapshot <> b.deposit
         OR br.deposit_refund <> GREATEST(0, br.deposit_snapshot - (br.late_fee + br.damage_fee + br.other_fee))
         OR br.amount_due <> GREATEST(0, (br.late_fee + br.damage_fee + br.other_fee) - br.deposit_snapshot)
    `);
    if (returnCheckRes.rows.length === 0) {
      console.log('   - Seluruh data deposit, denda, dan pengembalian pada booking_returns 100% konsisten. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${returnCheckRes.rows.length} record return dengan angka inkonsisten!`);
      returnCheckRes.rows.forEach((r) => console.error(`     * Booking #${r.booking_id}`));
      issuesCount += returnCheckRes.rows.length;
    }

    // 13. Cek Blok Servis Tidak Beririsan dengan Booking Aktif
    console.log('\n13. Pengecekan Irisan Jadwal Servis vs Booking Aktif:');
    const serviceOverlapRes = await client.query(`
      SELECT mb.id AS maint_id, b.id AS booking_id, mb.motorcycle_id
      FROM maintenance_blocks mb
      JOIN bookings b ON mb.motorcycle_id = b.motorcycle_id
      WHERE b.status IN ('pending', 'confirmed', 'active')
        AND daterange(mb.start_date, mb.end_date, '[)') && daterange(b.start_date, b.end_date, '[)')
    `);
    if (serviceOverlapRes.rows.length === 0) {
      console.log('   - Bebas konflik: Tidak ada blok servis beririsan dengan booking aktif/mendatang. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${serviceOverlapRes.rows.length} blok servis bertabrakan dengan booking aktif!`);
      issuesCount += serviceOverlapRes.rows.length;
    }

    // 14. Cek Minimal Satu Admin Aktif
    console.log('\n14. Pengecekan Ketersediaan Admin Aktif:');
    const adminCheckRes = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'admin' AND is_active = true
    `);
    const activeAdminCount = adminCheckRes.rows[0].cnt;
    if (activeAdminCount >= 1) {
      console.log(`   - Ditemukan ${activeAdminCount} admin aktif dalam sistem. (OK)`);
    } else {
      console.error('   - PELANGGARAN KRITIS: Tidak ditemukan satupun admin aktif dalam sistem!');
      issuesCount++;
    }

    // 15. Cek Ketahanan Audit Logs (Append-Only)
    console.log('\n15. Verifikasi Keamanan Audit Logs (Append-Only Trigger):');
    let auditTriggerOk = false;
    await client.query('BEGIN');
    try {
      const anyLog = await client.query('SELECT id FROM audit_logs LIMIT 1');
      if (anyLog.rows.length > 0) {
        await client.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['TAMPER', anyLog.rows[0].id]);
        await client.query('ROLLBACK');
        console.error('   - PELANGGARAN: Tabel audit_logs berhasil diubah (trigger append-only TIDAK BEKERJA)!');
        issuesCount++;
      } else {
        const trigRes = await client.query("SELECT COUNT(*)::int AS cnt FROM pg_trigger WHERE tgname = 'trg_audit_logs_no_update_delete'");
        if (trigRes.rows[0].cnt > 0) {
          auditTriggerOk = true;
          console.log('   - Trigger trg_audit_logs_no_update_delete terpasang aktif. (OK)');
        }
        await client.query('ROLLBACK');
      }
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.message.includes('append-only')) {
        auditTriggerOk = true;
        console.log('   - Trigger append-only menolak operasi UPDATE pada audit_logs secara sempurna. (OK)');
      } else {
        console.error('   - Error tidak terduga saat menguji trigger audit_logs:', err.message);
        issuesCount++;
      }
    }

    // 11. Pengecekan Integritas Fitur Pelacakan GPS
    console.log('\n11. Integritas Fitur Pelacakan GPS:');
    
    // 11.1 Satu perangkat per motor (UNIQUE constraint)
    const dupDevices = await client.query(`
      SELECT motorcycle_id, COUNT(*) AS cnt
      FROM gps_devices
      WHERE motorcycle_id IS NOT NULL
      GROUP BY motorcycle_id
      HAVING COUNT(*) > 1
    `);
    if (dupDevices.rows.length === 0) {
      console.log('   - 11.1 Rasio Perangkat: Tepat satu perangkat per motor. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan motor dengan lebih dari 1 perangkat GPS (${dupDevices.rows.length} motor)!`);
      issuesCount += dupDevices.rows.length;
    }

    // 11.2 Tidak ada posisi yatim (Orphan Positions)
    const orphanPositions = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM gps_positions p
      LEFT JOIN gps_devices d ON p.device_id = d.id
      WHERE d.id IS NULL
    `);
    const orphanGpsCount = orphanPositions.rows[0].cnt;
    if (orphanGpsCount === 0) {
      console.log('   - 11.2 Posisi Yatim: Nol posisi yatim, seluruh titik memiliki foreign key device valid. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${orphanGpsCount} posisi GPS yatim tanpa perangkat terdaftar!`);
      issuesCount++;
    }

    // 11.3 Posisi terakhir gps_devices konsisten dengan posisi terbaru pada gps_positions
    const posMismatch = await client.query(`
      SELECT d.id, d.label, d.last_recorded_at, MAX(p.recorded_at) AS latest_rec
      FROM gps_devices d
      JOIN gps_positions p ON d.id = p.device_id
      GROUP BY d.id, d.label, d.last_recorded_at
      HAVING d.last_recorded_at IS DISTINCT FROM MAX(p.recorded_at)
    `);
    if (posMismatch.rows.length === 0) {
      console.log('   - 11.3 Konsistensi Posisi Terakhir: Snapshot posisi perangkat sesuai dengan rekam posisi terbaru. (OK)');
    } else {
      console.error(`   - PELANGGARAN: Ditemukan ${posMismatch.rows.length} perangkat dengan last_recorded_at tidak cocok dengan rekam posisi terbaru!`);
      posMismatch.rows.forEach((r) => {
        console.error(`     * Device #${r.id} (${r.label}): snapshot=${r.last_recorded_at}, actual=${r.latest_rec}`);
      });
      issuesCount += posMismatch.rows.length;
    }

    console.log('\n============================================================');
    if (issuesCount === 0) {
      console.log('HASIL VERIFIKASI: SEMUA PEMERIKSAAN INTEGRITAS LULUS (0 MASALAH).\n');
      return { success: true, issuesCount: 0 };
    } else {
      console.error(`HASIL VERIFIKASI: DITEMUKAN ${issuesCount} PELANGGARAN INTEGRITAS!\n`);
      return { success: false, issuesCount };
    }
  } finally {
    client.release();
  }
}

if (require.main === module) {
  verifyDatabase()
    .then((result) => {
      if (result.success && result.issuesCount === 0) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  verifyDatabase,
};
