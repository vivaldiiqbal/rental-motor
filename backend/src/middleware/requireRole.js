const AppError = require('../utils/AppError');
const { userRepo } = require('../repositories');

/**
 * Middleware untuk memvalidasi peran pengguna pada setiap request langsung dari repository data.
 * Memastikan perubahan role atau penonaktifan akun berlaku seketika (real-time),
 * bukan hanya mengandalkan klaim token JWT yang mungkin usang.
 *
 * @param {...string} allowedRoles - Peran yang diizinkan (misal: 'admin', 'staff')
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user || !req.user.id) {
      return next(
        new AppError('Akses ditolak. Silakan login terlebih dahulu.', 'UNAUTHORIZED', 401),
      );
    }

    try {
      // Baca status dan role mutakhir langsung dari penyimpanan
      const freshUser = await userRepo.findById(req.user.id);
      if (!freshUser) {
        return next(
          new AppError('Akun pengguna sudah tidak terdaftar.', 'UNAUTHORIZED', 401),
        );
      }

      // Periksa apakah akun aktif
      const isActive = freshUser.isActive !== false && freshUser.is_active !== false;
      if (!isActive) {
        return next(
          new AppError('Akun Anda telah dinonaktifkan. Silakan hubungi administrator.', 'FORBIDDEN', 403),
        );
      }

      // Perbarui req.user dengan data terbaru
      req.user.role = freshUser.role;
      req.user.name = freshUser.name;
      req.user.email = freshUser.email;
      req.user.isActive = true;

      // Periksa apakah peran diizinkan
      if (allowedRoles.length > 0 && !allowedRoles.includes(freshUser.role)) {
        return next(
          new AppError(
            `Akses ditolak. Peran "${freshUser.role}" tidak memiliki izin untuk mengakses resource ini.`,
            'FORBIDDEN_ROLE',
            403,
          ),
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireRole;
module.exports.requireRole = requireRole;
