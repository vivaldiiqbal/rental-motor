const { pool } = require('../../db/pool');

/**
 * Truncate all tables and reset identity in rodakita_test.
 * Preserves schema_migrations.
 */
async function cleanDatabase(customClient = null) {
  const client = customClient || (await pool.connect());
  try {
    // Safety check
    const dbCheck = await client.query('SELECT current_database() AS db_name');
    const currentDb = dbCheck.rows[0].db_name;
    if (!currentDb.endsWith('_test')) {
      throw new Error(`[SECURITY FATAL] cleanDatabase menolak berjalan pada database bukan tes: ${currentDb}`);
    }

    // Disable triggers temporarily during truncate to prevent false cascade checks
    await client.query('ALTER TABLE reviews DISABLE TRIGGER trg_reviews_sync_stats;');
    await client.query('ALTER TABLE bookings DISABLE TRIGGER trg_bookings_status_transition;');
    await client.query('ALTER TABLE booking_handovers DISABLE TRIGGER trg_check_handover_booking_status;');
    await client.query('ALTER TABLE booking_returns DISABLE TRIGGER trg_check_return_booking_status;');

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
        users,
        audit_logs,
        app_settings,
        pages,
        page_versions,
        faqs,
        content_blocks,
        pricing_rules,
        discount_tiers
      RESTART IDENTITY CASCADE;
    `);

    // Re-enable triggers
    await client.query('ALTER TABLE reviews ENABLE TRIGGER trg_reviews_sync_stats;');
    await client.query('ALTER TABLE bookings ENABLE TRIGGER trg_bookings_status_transition;');
    await client.query('ALTER TABLE booking_handovers ENABLE TRIGGER trg_check_handover_booking_status;');
    await client.query('ALTER TABLE booking_returns ENABLE TRIGGER trg_check_return_booking_status;');
  } finally {
    if (!customClient) {
      client.release();
    }
  }
}

module.exports = {
  cleanDatabase,
};
