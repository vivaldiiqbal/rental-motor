const { userRepo, bookingRepo, documentRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES, USER_ROLES } = require('../../config/constants');

function sanitizeUser(u) {
  if (!u) return null;
  const user = { ...u };
  delete user.password;
  delete user.passwordHash;
  return user;
}

const adminUserService = {
  async getUsers(query = {}) {
    const { role, status, search, page = 1, limit = 20 } = query;
    const filter = {};
    if (role) filter.role = role;
    if (status) {
      if (status === 'active') filter.isActive = true;
      if (status === 'inactive') filter.isActive = false;
    }
    if (search) filter.search = search;

    const result = await userRepo.findAll(filter, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });

    return {
      items: result.items.map(sanitizeUser),
      total: result.total,
    };
  },

  async getUserById(id) {
    const user = await userRepo.findById(id);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Ambil histori booking pengguna
    const bookingsRes = await bookingRepo.findAll(
      { userId: user.id },
      { page: 1, limit: 100 }
    );

    // Ambil dokumen pengguna
    const documentsRes = await documentRepo.findAll({ userId: user.id });

    return {
      user: sanitizeUser(user),
      bookings: bookingsRes.items,
      documents: documentsRes.items,
    };
  },

  async toggleUserActive(targetUserId, isActive, reqContext = {}) {
    const actorId = reqContext.user?.id;
    if (String(actorId) === String(targetUserId)) {
      throw new AppError(
        'Admin dilarang menonaktifkan akun sendiri',
        400,
        ERROR_CODES.SELF_DEACTIVATION
      );
    }

    const targetUser = await userRepo.findById(targetUserId);
    if (!targetUser) {
      throw new AppError('Pengguna tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    return transaction(async (tx) => {
      // Kunci semua baris admin aktif dalam urutan ID ASC
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          "SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY id ASC FOR UPDATE"
        );
      }

      // Jika ingin menonaktifkan akun admin, pastikan bukan admin aktif terakhir
      if (targetUser.role === USER_ROLES.ADMIN && !isActive) {
        const activeAdminsCount = await tx.userRepo.countActiveAdmins(targetUserId);
        if (activeAdminsCount <= 0) {
          throw new AppError(
            'Dilarang menonaktifkan admin aktif terakhir di sistem',
            400,
            ERROR_CODES.LAST_ADMIN
          );
        }
      }

      const updated = await tx.userRepo.update(targetUserId, {
        isActive: Boolean(isActive),
        is_active: Boolean(isActive),
      });

      await recordAudit(
        tx.auditRepo,
        reqContext,
        isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
        'User',
        targetUserId,
        { isActive: targetUser.isActive !== false },
        { isActive: Boolean(isActive) }
      );

      return sanitizeUser(updated);
    });
  },

  async updateUserRole(targetUserId, newRole, reqContext = {}) {
    const validRoles = [USER_ROLES.ADMIN, USER_ROLES.STAFF, USER_ROLES.CUSTOMER];
    if (!validRoles.includes(newRole)) {
      throw new AppError('Role pengguna tidak valid', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const actorId = reqContext.user?.id;
    if (String(actorId) === String(targetUserId)) {
      throw new AppError(
        'Admin dilarang mengubah role akun sendiri',
        400,
        ERROR_CODES.SELF_ROLE_CHANGE
      );
    }

    const targetUser = await userRepo.findById(targetUserId);
    if (!targetUser) {
      throw new AppError('Pengguna tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    return transaction(async (tx) => {
      // Kunci semua baris admin aktif dalam urutan ID ASC
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query(
          "SELECT id FROM users WHERE role = 'admin' AND is_active = true ORDER BY id ASC FOR UPDATE"
        );
      }

      // Jika mengubah dari admin ke non-admin, pastikan bukan admin terakhir
      if (targetUser.role === USER_ROLES.ADMIN && newRole !== USER_ROLES.ADMIN) {
        const activeAdminsCount = await tx.userRepo.countActiveAdmins(targetUserId);
        if (activeAdminsCount <= 0) {
          throw new AppError(
            'Dilarang mendegradasi peran admin aktif terakhir di sistem',
            400,
            ERROR_CODES.LAST_ADMIN
          );
        }
      }

      const updated = await tx.userRepo.update(targetUserId, { role: newRole });

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'UPDATE_USER_ROLE',
        'User',
        targetUserId,
        { role: targetUser.role },
        { role: newRole }
      );

      return sanitizeUser(updated);
    });
  },
};

module.exports = adminUserService;
