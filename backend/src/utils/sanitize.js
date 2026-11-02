/**
 * Fungsi sanitasi objek untuk memastikan tidak ada data sensitif
 * (passwordHash, path internal dokumen, plat nomor lengkap) yang bocor ke response publik.
 */

function maskPlate(plate) {
  if (!plate || typeof plate !== 'string') return '';
  // Jika sudah tersamar dengan bintang, pertahankan
  if (plate.includes('*')) return plate;
  const parts = plate.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]} ***`;
  }
  return `${plate.slice(0, 4)} ***`;
}

function sanitizeUser(user) {
  if (!user) return null;
  const clean = { ...user };
  delete clean.passwordHash;
  delete clean.password;
  delete clean.salt;
  delete clean.resetToken;
  delete clean.resetTokenExpiry;

  // Mask path internal dokumen jika ada
  if (clean.documentPaths) {
    delete clean.documentPaths;
  }

  return clean;
}

function sanitizeMotor(motor, isAdmin = false) {
  if (!motor) return null;
  const clean = { ...motor };
  if (!isAdmin) {
    if (clean.plate) {
      clean.plate = maskPlate(clean.plate);
    }
    if (clean.plateNumber) {
      clean.plateNumber = maskPlate(clean.plateNumber);
    }
  }
  return clean;
}

function sanitizeMotors(motors, isAdmin = false) {
  if (!Array.isArray(motors)) return [];
  return motors.map((m) => sanitizeMotor(m, isAdmin));
}

function sanitizeBooking(booking) {
  if (!booking) return null;
  const clean = { ...booking };
  if (clean.motor) {
    clean.motor = sanitizeMotor(clean.motor);
  }
  return clean;
}

module.exports = {
  maskPlate,
  sanitizeUser,
  sanitizeMotor,
  sanitizeMotors,
  sanitizeBooking,
};
