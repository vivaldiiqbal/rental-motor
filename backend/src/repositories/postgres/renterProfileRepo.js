const { pool } = require('../../../db/pool');
const { mapRenterProfile } = require('./mappers');
const { handlePgError } = require('./errors');

const renterProfileRepo = {
  async findByUserId(userId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT * FROM renter_profiles WHERE user_id = $1',
        [Number(userId)],
      );
      if (res.rows.length === 0) return null;
      return mapRenterProfile(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByNikHash(nikHash, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'SELECT * FROM renter_profiles WHERE nik_hash = $1',
        [nikHash],
      );
      if (res.rows.length === 0) return null;
      return mapRenterProfile(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async upsert(userId, data, client = null) {
    const db = client || pool;
    try {
      const {
        fullNameKtp,
        birthDate,
        nikHash,
        nikLast4,
        addressKtp,
        phoneE164,
        stayAddress,
        emergencyName,
        emergencyRelation,
        emergencyPhone,
        termsVersionAccepted = 1,
        privacyVersionAccepted = 1,
        gpsConsentAt = new Date().toISOString(),
        completedAt = null,
      } = data;

      const query = `
        INSERT INTO renter_profiles (
          user_id, full_name_ktp, birth_date, nik_hash, nik_last4,
          address_ktp, phone_e164, stay_address,
          emergency_name, emergency_relation, emergency_phone,
          terms_version_accepted, privacy_version_accepted, gps_consent_at,
          completed_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14,
          $15, now()
        )
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
          updated_at = now()
        RETURNING *;
      `;

      const params = [
        Number(userId),
        fullNameKtp,
        birthDate,
        nikHash,
        nikLast4,
        addressKtp,
        phoneE164,
        stayAddress,
        emergencyName,
        emergencyRelation,
        emergencyPhone,
        termsVersionAccepted,
        privacyVersionAccepted,
        gpsConsentAt,
        completedAt,
      ];

      const res = await db.query(query, params);
      return mapRenterProfile(res.rows[0]);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async delete(userId, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        'DELETE FROM renter_profiles WHERE user_id = $1',
        [Number(userId)],
      );
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = renterProfileRepo;
