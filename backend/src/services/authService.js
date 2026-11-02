const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { userRepo } = require('../repositories');
const AppError = require('../utils/AppError');
const { sanitizeUser } = require('../utils/sanitize');

class AuthService {
  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN },
    );
  }

  async register({ name, email, phone, password }) {
    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw new AppError('Email sudah terdaftar. Silakan gunakan email lain atau masuk ke akun Anda.', 'VALIDATION_ERROR', 409);
    }

    const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await userRepo.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      passwordHash,
      role: 'customer',
      documents: { ktp: 'not_uploaded', sim: 'not_uploaded' },
      preferences: { emailNotif: true, whatsappNotif: true, promo: false },
      emergencyContact: { name: '', phone: '' },
    });

    const token = this.generateToken(newUser);
    return {
      user: sanitizeUser(newUser),
      token,
    };
  }

  async login(email, password) {
    const user = await userRepo.findByEmail(email);
    // Pesan umum "Email atau sandi salah" agar tidak membocorkan keberadaan email
    if (!user || !user.passwordHash) {
      throw new AppError('Email atau sandi salah', 'UNAUTHORIZED', 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AppError('Email atau sandi salah', 'UNAUTHORIZED', 401);
    }

    const token = this.generateToken(user);
    return {
      user: sanitizeUser(user),
      token,
    };
  }

  async getMe(userId) {
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 'NOT_FOUND', 404);
    }
    const sanitized = sanitizeUser(user);
    return {
      ...sanitized,
      docsStatus: user.documents || { ktp: 'not_uploaded', sim: 'not_uploaded' },
    };
  }

  async updateMe(userId, { name, phone, emergencyContact }) {
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 'NOT_FOUND', 404);
    }

    const patch = {};
    if (name) patch.name = name;
    if (phone) patch.phone = phone;
    if (emergencyContact) {
      patch.emergencyContact = {
        ...(user.emergencyContact || {}),
        ...emergencyContact,
      };
    }

    const updated = await userRepo.update(userId, patch);
    return sanitizeUser(updated);
  }

  async updatePassword(userId, currentPassword, newPassword) {
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 'NOT_FOUND', 404);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Kata sandi saat ini tidak sesuai.', 'UNAUTHORIZED', 401);
    }

    const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
    const newHash = await bcrypt.hash(newPassword, salt);

    await userRepo.update(userId, { passwordHash: newHash });
    return true;
  }

  async forgotPassword(email) {
    await userRepo.findByEmail(email);
    // Selalu kembalikan respon sukses dengan pesan netral
    return {
      message: 'Jika alamat email terdaftar di sistem kami, instruksi pemulihan kata sandi telah dikirimkan.',
    };
  }
}

module.exports = new AuthService();
