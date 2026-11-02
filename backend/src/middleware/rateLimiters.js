const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { errorResponse } = require('../utils/response');

const isTest = env.NODE_ENV === 'test';

// 1. Umum: 3000 request / 15 menit di dev, 300 di prod
const generalLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.NODE_ENV === 'development' ? 5000 : 300,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        return errorResponse(res, {
          code: 'RATE_LIMITED',
          message: 'Terlalu banyak permintaan dari perangkat Anda. Silakan coba kembali dalam beberapa menit.',
          statusCode: 429,
          requestId: req.id,
        });
      },
    });

// 2. Login & Register: 200 di dev, 15 di prod per 15 menit per IP
const authLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.NODE_ENV === 'development' ? 200 : parseInt(process.env.AUTH_RATE_LIMIT_MAX || env.AUTH_RATE_LIMIT_MAX || 15, 10),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        return errorResponse(res, {
          code: 'RATE_LIMITED',
          message: 'Terlalu banyak percobaan autentikasi. Silakan coba kembali nanti.',
          statusCode: 429,
          requestId: req.id,
        });
      },
    });

// 3. Forgot Password & Contact: 5 request / jam per IP
const sensitiveFormLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        return errorResponse(res, {
          code: 'RATE_LIMITED',
          message: 'Batas pengiriman form telah tercapai (maksimal 5 kali per jam). Silakan coba lagi nanti.',
          statusCode: 429,
          requestId: req.id,
        });
      },
    });

// 4. Pembuatan Booking: 20 request / jam per pengguna
const bookingCreationLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 20,
      keyGenerator: (req) => (req.user && req.user.id ? `user_${req.user.id}` : req.ip),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        return errorResponse(res, {
          code: 'RATE_LIMITED',
          message: 'Batas pembuatan pemesanan tercapai (maksimal 20 kali per jam).',
          statusCode: 429,
          requestId: req.id,
        });
      },
    });

// 5. Admin API Umum: 10000 request / 15 menit di dev, 600 di prod
const adminLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.NODE_ENV === 'development' ? 10000 : 600,
      keyGenerator: (req) => (req.user && req.user.id ? `admin_${req.user.id}` : req.ip),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        return errorResponse(res, {
          code: 'RATE_LIMITED',
          message: 'Batas permintaan API Admin tercapai (maksimal 600 per 15 menit). Silakan tunggu sejenak.',
          statusCode: 429,
          requestId: req.id,
        });
      },
    });

// 6. Admin CSV Export: 30 request / 15 menit per pengguna
const exportLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      keyGenerator: (req) => (req.user && req.user.id ? `export_${req.user.id}` : req.ip),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        return errorResponse(res, {
          code: 'RATE_LIMITED',
          message: 'Batas pengunduhan berkas laporan/ekspor tercapai (maksimal 30 kali per 15 menit).',
          statusCode: 429,
          requestId: req.id,
        });
      },
    });

// 7. Admin Upload: 60 request / 15 menit per pengguna
const uploadLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 60,
      keyGenerator: (req) => (req.user && req.user.id ? `upload_${req.user.id}` : req.ip),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        return errorResponse(res, {
          code: 'RATE_LIMITED',
          message: 'Batas unggah berkas tercapai (maksimal 60 kali per 15 menit).',
          statusCode: 429,
          requestId: req.id,
        });
      },
    });

module.exports = {
  generalLimiter,
  authLimiter,
  sensitiveFormLimiter,
  bookingCreationLimiter,
  adminLimiter,
  exportLimiter,
  uploadLimiter,
};
