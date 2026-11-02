const { maintenanceRepo, bookingRepo, motorRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');
const { isValidISODate } = require('../../utils/dates');

const maintenanceService = {
  async getMaintenanceBlocks(query = {}) {
    const { motorId, status, search, page = 1, limit = 50 } = query;
    return maintenanceRepo.findAll(
      { motorId, status, search },
      { page: Number(page) || 1, limit: Number(limit) || 50 }
    );
  },

  async getMaintenanceById(id) {
    const item = await maintenanceRepo.findById(id);
    if (!item) {
      throw new AppError('Data perawatan tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return item;
  },

  async createMaintenanceBlock(data, reqContext = {}) {
    const { motorId, startDate, endDate, reason, cost, technician, notes } = data;

    if (!motorId || !startDate || !endDate || !reason) {
      throw new AppError('motorId, startDate, endDate, dan reason wajib diisi', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
      throw new AppError('Format tanggal harus YYYY-MM-DD yang valid', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (startDate > endDate) {
      throw new AppError('startDate tidak boleh lebih besar dari endDate', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const motor = await motorRepo.findById(motorId);
    if (!motor) {
      throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    return transaction(async (tx) => {
      // Kunci baris motor FOR UPDATE (kunci SAMA yang dipakai saat pembuatan booking pelanggan)
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query('SELECT id FROM motorcycles WHERE id = $1 FOR UPDATE', [Number(motorId)]);
      }

      // 1. Cek tabrakan dengan booking aktif / mendatang
      const conflictingBookings = await tx.bookingRepo.findConflictingForMotor(motorId, startDate, endDate);
      if (conflictingBookings.length > 0) {
        const err = new AppError(
          `Jadwal servis menabrak ${conflictingBookings.length} booking pelanggan yang aktif/mendatang`,
          409,
          ERROR_CODES.MAINTENANCE_CONFLICT
        );
        err.data = {
          conflicts: conflictingBookings.map((b) => ({
            id: b.id,
            bookingCode: b.bookingCode || b.code,
            startDate: b.startDate,
            endDate: b.endDate,
            status: b.status,
          })),
        };
        throw err;
      }

      // 2. Cek tabrakan dengan jadwal servis lain
      const conflictingMaintenance = await tx.maintenanceRepo.findOverlapping(motorId, startDate, endDate);
      if (conflictingMaintenance.length > 0) {
        const err = new AppError(
          `Jadwal servis beririsan dengan jadwal servis lain yang sudah terdaftar`,
          409,
          ERROR_CODES.MAINTENANCE_CONFLICT
        );
        err.data = {
          conflicts: conflictingMaintenance.map((m) => ({
            id: m.id,
            startDate: m.startDate,
            endDate: m.endDate,
            reason: m.reason,
          })),
        };
        throw err;
      }

      const newBlock = await tx.maintenanceRepo.create({
        motorId: Number(motorId),
        motorName: motor.name,
        startDate,
        endDate,
        reason: reason.trim(),
        cost: Number(cost) || 0,
        technician: technician ? technician.trim() : '',
        notes: notes ? notes.trim() : '',
        status: 'scheduled',
      });

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'CREATE_MAINTENANCE',
        'Maintenance',
        newBlock.id,
        null,
        newBlock
      );

      return newBlock;
    });
  },

  async updateMaintenanceBlock(id, data, reqContext = {}) {
    const existing = await maintenanceRepo.findById(id);
    if (!existing) {
      throw new AppError('Data perawatan tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const startDate = data.startDate || existing.startDate;
    const endDate = data.endDate || existing.endDate;
    const motorId = data.motorId ? Number(data.motorId) : existing.motorId;

    if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
      throw new AppError('Format tanggal harus YYYY-MM-DD yang valid', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (startDate > endDate) {
      throw new AppError('startDate tidak boleh lebih besar dari endDate', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return transaction(async (tx) => {
      // Cek tabrakan jika tanggal atau motorId berubah
      if (startDate !== existing.startDate || endDate !== existing.endDate || motorId !== existing.motorId) {
        const conflictingBookings = await bookingRepo.findConflictingForMotor(motorId, startDate, endDate);
        if (conflictingBookings.length > 0) {
          const err = new AppError(
            `Jadwal servis menabrak ${conflictingBookings.length} booking pelanggan`,
            409,
            ERROR_CODES.MAINTENANCE_CONFLICT
          );
          err.data = {
            conflicts: conflictingBookings.map((b) => ({
              id: b.id,
              bookingCode: b.bookingCode || b.code,
              startDate: b.startDate,
              endDate: b.endDate,
              status: b.status,
            })),
          };
          throw err;
        }

        const conflictingMaintenance = await maintenanceRepo.findOverlapping(motorId, startDate, endDate, id);
        if (conflictingMaintenance.length > 0) {
          const err = new AppError(
            `Jadwal servis beririsan dengan jadwal servis lain`,
            409,
            ERROR_CODES.MAINTENANCE_CONFLICT
          );
          err.data = {
            conflicts: conflictingMaintenance.map((m) => ({
              id: m.id,
              startDate: m.startDate,
              endDate: m.endDate,
              reason: m.reason,
            })),
          };
          throw err;
        }
      }

      const patch = { ...data };
      if (data.cost !== undefined) patch.cost = Number(data.cost);

      const updated = await tx.maintenanceRepo.update(id, patch);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'UPDATE_MAINTENANCE',
        'Maintenance',
        id,
        existing,
        updated
      );

      return updated;
    });
  },

  async deleteMaintenanceBlock(id, reqContext = {}) {
    const existing = await maintenanceRepo.findById(id);
    if (!existing) {
      throw new AppError('Data perawatan tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    return transaction(async (tx) => {
      await tx.maintenanceRepo.delete(id);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'DELETE_MAINTENANCE',
        'Maintenance',
        id,
        existing,
        null
      );

      return { success: true };
    });
  },

  async completeMaintenanceBlock(id, data = {}, reqContext = {}) {
    const existing = await maintenanceRepo.findById(id);
    if (!existing) {
      throw new AppError('Data perawatan tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const clock = require('../../utils/clock');
    const { toISODate, addDays, parseDate } = require('../../utils/dates');
    const todayWIB = toISODate(clock.now());

    // Jika diselesaikan lebih awal, perpendek endDate ke hari ini
    // Memastikan endDate > startDate sesuai batasan konsistensi
    let newEndDate = existing.endDate;
    if (todayWIB < existing.endDate) {
      if (todayWIB > existing.startDate) {
        newEndDate = todayWIB;
      } else {
        const sDate = parseDate(existing.startDate) || new Date(existing.startDate);
        newEndDate = toISODate(addDays(sDate, 1));
      }
    }

    const patch = {
      status: 'completed',
      completedAt: clock.now().toISOString(),
      completedBy: reqContext.user?.id || null,
      cost: data.cost !== undefined ? Number(data.cost) : existing.cost,
      completionNotes: data.notes || data.completionNotes || 'Servis selesai',
      endDate: newEndDate,
    };

    return transaction(async (tx) => {
      const updated = await tx.maintenanceRepo.update(id, patch);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'COMPLETE_MAINTENANCE',
        'Maintenance',
        id,
        existing,
        updated
      );

      return updated;
    });
  },
};

module.exports = maintenanceService;
