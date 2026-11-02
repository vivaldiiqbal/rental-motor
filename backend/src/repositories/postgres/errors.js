const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

/**
 * Menerjemahkan error kode dan constraint PostgreSQL menjadi AppError standar domain.
 * Pesan error disajikan dalam Bahasa Indonesia yang ramah pengguna,
 * tanpa membocorkan struktur SQL atau nama tabel basis data internal.
 */
function handlePgError(err, context = '') {
  if (!err) return err;

  // Jika sudah merupakan instance AppError, kembalikan langsung
  if (err instanceof AppError || err.isOperational) {
    return err;
  }

  const { code, constraint, detail } = err;

  // Tangani kode error class 08xxx (Connection Exception)
  if (code && typeof code === 'string' && code.startsWith('08')) {
    logger.error(`[DB CONNECTION ERROR] ${code}: ${err.message}`, { detail });
    return new AppError('Layanan basis data sedang tidak dapat dijangkau. Silakan coba kembali beberapa saat lagi.', 'SERVICE_UNAVAILABLE', 503);
  }

  switch (code) {
    case '23P01': // exclusion_violation
      if (constraint === 'no_overlapping_maintenance') {
        return new AppError(
          'Motor sedang dalam masa pemeliharaan berkala atau servis pada rentang tanggal tersebut.',
          'MAINTENANCE_CONFLICT',
          409,
        );
      }
      return new AppError(
        'Maaf, motor sudah tidak tersedia di rentang tanggal tersebut karena jadwal bertabrakan.',
        'BOOKING_CONFLICT',
        409,
      );

    case '23505': // unique_violation
      if (constraint === 'idx_users_email_lower' || (detail && detail.includes('lower(email)'))) {
        return new AppError('Email sudah terdaftar. Silakan gunakan email lain.', 'EMAIL_TAKEN', 409);
      }
      if (constraint === 'bookings_booking_code_key' || constraint === 'bookings_code_key' || (detail && detail.includes('booking_code'))) {
        return new AppError('Kode pemesanan sudah terdaftar di sistem.', 'CODE_EXISTS', 409);
      }
      if (constraint === 'idx_promo_codes_upper' || constraint === 'promos_code_key' || constraint === 'promo_codes_code_key' || (detail && detail.includes('code'))) {
        return new AppError('Kode promo sudah ada di sistem.', 'DUPLICATE_RESOURCE', 409);
      }
      if (constraint === 'reviews_booking_id_key' || constraint === 'idx_reviews_one_per_booking') {
        return new AppError('Pemesanan ini sudah pernah Anda beri ulasan.', 'VALIDATION_ERROR', 400);
      }
      if (constraint === 'uq_favorites_user_motor' || constraint === 'favorites_user_id_motorcycle_id_key') {
        return new AppError('Motor sudah ada di daftar favorit.', 'ALREADY_EXISTS', 409);
      }
      if (constraint === 'motorcycles_slug_key') {
        return new AppError('Slug motor sudah terdaftar. Gunakan slug lain.', 'DUPLICATE_RESOURCE', 409);
      }
      if (constraint === 'motorcycles_plate_number_key' || constraint === 'uq_motorcycles_plate_number' || (detail && detail.includes('plate_number'))) {
        return new AppError('Nomor plat motor sudah terdaftar di sistem.', 'DUPLICATE_RESOURCE', 409);
      }
      if (constraint === 'payment_events_provider_event_id_key') {
        return new AppError('Event webhook pembayaran sudah pernah diproses.', 'DUPLICATE_RESOURCE', 409);
      }
      return new AppError('Data duplikat terdeteksi pada sistem.', 'DUPLICATE_RESOURCE', 409);

    case '23503': // foreign_key_violation
      if (constraint && constraint.includes('user_id')) {
        return new AppError('Pengguna tidak ditemukan dalam sistem.', 'NOT_FOUND', 404);
      }
      if (constraint && (constraint.includes('motorcycle_id') || constraint.includes('motor_id'))) {
        return new AppError('Data motor tidak ditemukan dalam sistem.', 'NOT_FOUND', 404);
      }
      if (constraint && constraint.includes('booking_id')) {
        return new AppError('Data pemesanan tidak ditemukan.', 'NOT_FOUND', 404);
      }
      return new AppError('Relasi data tidak ditemukan atau referensi tidak valid.', 'NOT_FOUND', 404);

    case '23514': // check_violation
      if (constraint && (constraint.includes('return') || constraint.includes('handover'))) {
        logger.error(`[BUG: DB CHECK VIOLATION] Pelanggaran CHECK konsistensi '${constraint}': ${err.message}`, { detail });
      } else {
        logger.warn(`[DB CHECK VIOLATION] Constraint '${constraint}' dilanggar: ${err.message}`, { detail });
      }
      return new AppError('Validasi aturan integritas data gagal.', 'VALIDATION_ERROR', 422);

    case 'RM001': // Trigger transisi status booking tidak valid
      return new AppError(err.message || 'Transisi status pemesanan tidak valid.', 'INVALID_STATUS_TRANSITION', 409);

    case '22P02': // invalid_text_representation
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
      return new AppError('Format parameter atau tanggal yang diberikan tidak valid.', 'INVALID_FORMAT', 400);

    case '57014': // query_canceled / statement_timeout
      logger.error(`[DB TIMEOUT] Query statement timeout: ${err.message}`);
      return new AppError('Batas waktu eksekusi basis data terlampaui. Silakan coba kembali sesaat lagi.', 'TIMEOUT', 503);

    case '57P01': // admin_shutdown
    case '57P02': // crash_shutdown
    case '57P03': // cannot_connect_now
    case '53300': // too_many_connections
      logger.error(`[DB CAPACITY ERROR] ${code}: ${err.message}`);
      return new AppError('Koneksi basis data terputus atau server sedang restart. Silakan coba kembali.', 'SERVICE_UNAVAILABLE', 503);

    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return new AppError('Terjadi bentrok transaksi simultan. Silakan coba kembali sesaat lagi.', 'CONCURRENCY_ERROR', 503);

    default:
      console.log('UNHANDLED DB ERROR CODE:', code, 'MESSAGE:', err.message, 'DETAIL:', detail);
      logger.error(`[UNHANDLED DB ERROR] ${code || 'UNKNOWN'}: ${err.message}`, { stack: err.stack, detail });
      return new AppError('Terjadi kesalahan internal pada server.', 'INTERNAL_ERROR', 500);
  }
}

module.exports = {
  handlePgError,
};
