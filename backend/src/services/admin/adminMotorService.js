const { motorRepo, bookingRepo, maintenanceRepo, gpsRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');
const { toISODate, getNowWIB } = require('../../utils/dates');
const broadcaster = require('../realtime/eventBroadcaster');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DEFAULT_STATUS_OPTIONS = [
  { label: 'Semua Status', value: 'all' },
  { label: 'Tersedia', value: 'available' },
  { label: 'Disewa', value: 'rented' },
  { label: 'Servis', value: 'maintenance' },
  { label: 'Nonaktif', value: 'inactive' },
];

const adminMotorService = {
  async getFilterOptions() {
    let brands = [];
    let types = [];
    try {
      if (typeof motorRepo.getAdminFilterOptions === 'function') {
        const res = await motorRepo.getAdminFilterOptions();
        brands = res.brands || [];
        types = res.types || [];
      } else {
        const all = await motorRepo.findAll({}, { page: 1, limit: 1000 });
        const list = all.items || [];
        brands = [...new Set(list.map((m) => m.brand).filter(Boolean))].sort();
        types = [...new Set(list.map((m) => m.type).filter(Boolean))].sort();
      }
    } catch {
      brands = [];
      types = [];
    }
    return {
      brands,
      types,
      statuses: DEFAULT_STATUS_OPTIONS,
    };
  },

  async getMotorcycles(query = {}) {
    const rawBrand = typeof query.brand === 'string' ? query.brand.trim() : '';
    const rawType = typeof query.type === 'string' ? query.type.trim() : '';
    const rawStatus = typeof query.status === 'string' ? query.status.trim() : '';
    const rawSearch = typeof query.search === 'string' ? query.search.trim() : '';
    const rawSort = typeof query.sort === 'string' ? query.sort.trim() : '';
    const rawSortBy = typeof query.sortBy === 'string' ? query.sortBy.trim() : '';
    const rawSortDir = typeof query.sortDir === 'string' && query.sortDir.toLowerCase() === 'desc' ? 'desc' : 'asc';

    const parsedPage = parseInt(query.page, 10);
    const pageNum = !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedLimit = parseInt(query.limit, 10);
    const limitNum = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(200, parsedLimit) : 50;

    // 1. Ambil seluruh motor dari repository (untuk opsi filter dan pencocokan fleksibel)
    const allRes = await motorRepo.findAll({}, { page: 1, limit: 1000 });
    const allMotors = allRes.items || [];

    const distinctBrands = [...new Set(allMotors.map((m) => m.brand).filter(Boolean))].sort();
    const distinctTypes = [...new Set(allMotors.map((m) => m.type).filter(Boolean))].sort();
    const filtersMeta = {
      brands: distinctBrands,
      types: distinctTypes,
      statuses: DEFAULT_STATUS_OPTIONS,
    };

    let items = [...allMotors];

    if (rawBrand && rawBrand !== 'all') {
      const bLower = rawBrand.toLowerCase();
      items = items.filter((m) => m.brand && m.brand.toLowerCase() === bLower);
    }

    if (rawType && rawType !== 'all') {
      const tLower = rawType.toLowerCase();
      items = items.filter((m) => m.type && m.type.toLowerCase() === tLower);
    }

    // 2. Filter pencarian teks bebas (nama, brand, plat nomor asli, tipe)
    if (rawSearch) {
      const q = rawSearch.toLowerCase();
      items = items.filter(
        (m) =>
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.brand && m.brand.toLowerCase().includes(q)) ||
          (m.plate && m.plate.toLowerCase().includes(q)) ||
          (m.plateNumber && m.plateNumber.toLowerCase().includes(q)) ||
          (m.type && m.type.toLowerCase().includes(q))
      );
    }

    if (items.length === 0) {
      return {
        items: [],
        total: 0,
        page: pageNum,
        limit: limitNum,
        totalPages: 1,
        filters: filtersMeta,
      };
    }

    // 3. Kumpulkan ID motor untuk agregasi data relasional dalam 1 batch (0 N+1)
    const todayStr = toISODate(getNowWIB());
    const nowMs = Date.now();
    const offlineThresholdMs = 15 * 60 * 1000; // 15 menit

    // 4. Batch lookup perangkat GPS dan alert aktif
    let devices = [];
    let openAlerts = [];
    try {
      if (gpsRepo && typeof gpsRepo.listDevices === 'function') {
        const devRes = await gpsRepo.listDevices({ isActive: true }, { limit: 1000 });
        devices = Array.isArray(devRes) ? devRes : (devRes.data || []);
      }
      if (gpsRepo && typeof gpsRepo.listAlerts === 'function') {
        const alertRes = await gpsRepo.listAlerts({ isOpenOnly: true }, { limit: 1000 });
        openAlerts = Array.isArray(alertRes) ? alertRes : (alertRes.data || []);
      }
    } catch {
      devices = [];
      openAlerts = [];
    }

    const deviceByMotorId = new Map();
    for (const d of devices) {
      if (d.motorcycleId) {
        deviceByMotorId.set(Number(d.motorcycleId), d);
      }
    }

    const alertsByDeviceId = new Map();
    for (const a of openAlerts) {
      const devId = Number(a.deviceId);
      if (!alertsByDeviceId.has(devId)) alertsByDeviceId.set(devId, []);
      alertsByDeviceId.get(devId).push(a);
    }

    // 5. Batch lookup booking aktif/berjalan hari ini (WIB)
    let activeBookings = [];
    try {
      if (bookingRepo && typeof bookingRepo.findAll === 'function') {
        const bRes = await bookingRepo.findAll(
          { dateRange: { start: todayStr, end: todayStr } },
          { limit: 1000 }
        );
        const bList = bRes.items || [];
        activeBookings = bList.filter(
          (b) =>
            ['confirmed', 'active'].includes(b.status) &&
            b.startDate <= todayStr &&
            b.endDate > todayStr
        );
      }
    } catch {
      activeBookings = [];
    }

    const bookingByMotorId = new Map();
    for (const b of activeBookings) {
      const mId = Number(b.motorcycleId || b.motorId);
      if (mId) bookingByMotorId.set(mId, b);
    }

    // 6. Batch lookup maintenance block hari ini (WIB)
    let maintenanceBlocks = [];
    try {
      if (maintenanceRepo && typeof maintenanceRepo.findAll === 'function') {
        const mRes = await maintenanceRepo.findAll(
          { dateRange: { start: todayStr, end: todayStr } },
          { limit: 1000 }
        );
        const mList = mRes.items || [];
        maintenanceBlocks = mList.filter(
          (mb) =>
            mb.status === 'in_progress' ||
            (mb.startDate <= todayStr && mb.endDate >= todayStr && mb.status !== 'completed')
        );
      }
    } catch {
      maintenanceBlocks = [];
    }

    const maintenanceByMotorId = new Map();
    for (const mb of maintenanceBlocks) {
      const mId = Number(mb.motorId || mb.motorcycleId);
      if (mId) maintenanceByMotorId.set(mId, mb);
    }

    // 7. Pengkayaan data motor dengan status operasional server dan status GPS
    const enriched = items.map((motor) => {
      const mId = Number(motor.id);
      const dataStatus = motor.status === 'available' || motor.status === 'active'
        ? 'active'
        : motor.status === 'maintenance'
        ? 'maintenance'
        : motor.status === 'inactive'
        ? 'inactive'
        : 'active';

      // Status Operasional Bahasa Indonesia
      let operationalStatus = 'Tersedia';
      let statusKey = 'available';

      if (dataStatus === 'inactive') {
        operationalStatus = 'Nonaktif';
        statusKey = 'inactive';
      } else if (dataStatus === 'maintenance' || maintenanceByMotorId.has(mId)) {
        operationalStatus = 'Servis';
        statusKey = 'maintenance';
      } else if (bookingByMotorId.has(mId)) {
        operationalStatus = 'Disewa';
        statusKey = 'rented';
      } else {
        operationalStatus = 'Tersedia';
        statusKey = 'available';
      }

      // Status GPS & koordinat terakhir
      const dev = deviceByMotorId.get(mId);
      let gpsStatus = 'no_device';
      let gpsStatusLabel = 'Belum ada alat GPS';
      let gpsObj = {
        hasDevice: false,
        status: 'no_device',
        statusLabel: 'Belum ada alat GPS',
        deviceId: null,
        label: null,
        isOnline: false,
        hasAlert: false,
        openAlertsCount: 0,
        batteryPct: null,
        lastLat: null,
        lastLng: null,
        lastSeenAt: null,
      };

      if (dev) {
        const lastSeen = dev.lastSeenAt ? new Date(dev.lastSeenAt).getTime() : 0;
        const isOnline = Boolean(dev.isActive && lastSeen > 0 && (nowMs - lastSeen <= offlineThresholdMs));
        const devAlerts = alertsByDeviceId.get(Number(dev.id)) || [];
        const hasAlert = devAlerts.length > 0;

        if (hasAlert) {
          gpsStatus = 'alert';
          gpsStatusLabel = 'Peringatan terbuka';
        } else if (isOnline) {
          gpsStatus = 'online';
          gpsStatusLabel = 'Online';
        } else {
          gpsStatus = 'offline';
          gpsStatusLabel = 'Offline';
        }

        gpsObj = {
          hasDevice: true,
          status: gpsStatus,
          statusLabel: gpsStatusLabel,
          deviceId: dev.id,
          label: dev.label || dev.externalId,
          isOnline,
          hasAlert,
          openAlertsCount: devAlerts.length,
          batteryPct: dev.batteryPct ?? dev.lastBatteryPct ?? null,
          lastLat: dev.lastLat || null,
          lastLng: dev.lastLng || null,
          lastSeenAt: dev.lastSeenAt || null,
        };
      }

      // Plat nomor asli tanpa masking
      const plate = typeof motor.plate === 'string'
        ? motor.plate
        : typeof motor.plateNumber === 'string'
        ? motor.plateNumber
        : '';

      const images = Array.isArray(motor.images) ? motor.images.filter(Boolean) : [];
      const primaryImage = motor.primaryImage || images[0] || null;
      const reviewCount = Number(motor.reviewCount ?? motor.ratingCount ?? 0);
      const rating = reviewCount > 0 ? Number(motor.rating ?? motor.ratingAvg ?? 5.0) : Number(motor.rating ?? 0);

      return {
        ...motor,
        plate,
        plateNumber: plate,
        dataStatus,
        status: statusKey,
        operationalStatus,
        gpsStatus,
        gpsStatusLabel,
        gps: gpsObj,
        images,
        primaryImage,
        rating,
        reviewCount,
      };
    });

    // 8. Filter berdasarkan status jika diminta
    let filtered = enriched;
    if (rawStatus && rawStatus !== 'all') {
      const s = rawStatus.toLowerCase();
      filtered = filtered.filter((m) => {
        if (s === 'available' || s === 'tersedia' || s === 'active') return m.status === 'available';
        if (s === 'rented' || s === 'disewa') return m.status === 'rented';
        if (s === 'maintenance' || s === 'servis') return m.status === 'maintenance';
        if (s === 'inactive' || s === 'nonaktif') return m.status === 'inactive';
        // Nilai status yang tidak dikenal jatuh ke default (tanpa filter) agar tidak kosong / error
        return true;
      });
    }

    // 9. Sorting
    const sortKey = rawSort || (rawSortBy ? `${rawSortBy}-${rawSortDir}` : '');
    if (sortKey === 'price-asc' || sortKey === 'pricePerDay-asc') {
      filtered.sort((a, b) => (a.pricePerDay || 0) - (b.pricePerDay || 0));
    } else if (sortKey === 'price-desc' || sortKey === 'pricePerDay-desc') {
      filtered.sort((a, b) => (b.pricePerDay || 0) - (a.pricePerDay || 0));
    } else if (sortKey === 'name-asc') {
      filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
    } else if (sortKey === 'name-desc') {
      filtered.sort((a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'id'));
    } else if (sortKey === 'rating' || sortKey === 'rating-desc') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortKey === 'rating-asc') {
      filtered.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    } else {
      filtered.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    }

    // 10. Pagination
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const safePage = Math.min(pageNum, totalPages);
    const offset = (safePage - 1) * limitNum;
    const pagedItems = filtered.slice(offset, offset + limitNum);

    return {
      items: pagedItems,
      total,
      page: safePage,
      limit: limitNum,
      totalPages,
      filters: filtersMeta,
    };
  },

  async getMotorcycleById(id) {
    const motor = await motorRepo.findById(id);
    if (!motor) {
      throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return motor;
  },

  async createMotorcycle(data, reqContext = {}) {
    const {
      name,
      brand,
      type,
      cc,
      year,
      color,
      plate,
      transmission,
      fuelCapacity,
      pricePerDay,
      deposit,
      description,
      features,
      images,
      status = 'available',
    } = data;

    if (!name || !brand || !type || !plate) {
      throw new AppError('Nama, brand, type, dan plat motor wajib diisi', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Cek plat nomor unik (case-insensitive & normalize spaces)
    const existingPlate = await motorRepo.findByPlate(plate);
    if (existingPlate) {
      throw new AppError(`Plat nomor ${plate} sudah terdaftar di sistem`, 409, ERROR_CODES.VALIDATION_ERROR);
    }

    // Generate unique slug
    let baseSlug = slugify(name);
    let finalSlug = baseSlug;
    let counter = 1;
    while (await motorRepo.findBySlug(finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    return transaction(async (tx) => {
      const motorData = {
        name: name.trim(),
        slug: finalSlug,
        brand: brand.trim(),
        type: type.trim(),
        cc: cc ? Number(cc) : 110,
        year: year ? Number(year) : new Date().getFullYear(),
        color: color ? color.trim() : '',
        plate: plate.trim(),
        transmission: transmission || 'Otomatis',
        fuelCapacity: fuelCapacity ? Number(fuelCapacity) : 4.0,
        pricePerDay: Number(pricePerDay) || 0,
        deposit: Number(deposit) || 0,
        description: description ? description.trim() : '',
        features: Array.isArray(features) ? features : [],
        images: Array.isArray(images) ? images : [],
        status: status || 'available',
        odometer: 0,
      };

      const created = await tx.motorRepo.create(motorData);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'CREATE_MOTORCYCLE',
        'Motorcycle',
        created.id,
        null,
        created
      );

      try {
        await broadcaster.publish(tx, {
          type: 'motor.availability.changed',
          entityId: created.id,
          userId: null,
        });
      } catch {}

      return created;
    });
  },

  async updateMotorcycle(id, data, reqContext = {}) {
    const motor = await motorRepo.findById(id);
    if (!motor) {
      throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    if (data.plate) {
      const existingPlate = await motorRepo.findByPlate(data.plate, id);
      if (existingPlate) {
        throw new AppError(`Plat nomor ${data.plate} sudah terdaftar pada motor lain`, 409, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    let finalSlug = motor.slug;
    if (data.name && data.name.trim() !== motor.name) {
      const baseSlug = slugify(data.name);
      finalSlug = baseSlug;
      let counter = 1;
      while (await motorRepo.findBySlug(finalSlug, id)) {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    return transaction(async (tx) => {
      const patch = { ...data };
      if (data.name) patch.name = data.name.trim();
      patch.slug = finalSlug;
      if (data.plate) patch.plate = data.plate.trim();
      if (data.pricePerDay !== undefined) patch.pricePerDay = Number(data.pricePerDay);
      if (data.deposit !== undefined) patch.deposit = Number(data.deposit);
      if (data.cc !== undefined) patch.cc = Number(data.cc);
      if (data.year !== undefined) patch.year = Number(data.year);
      if (data.fuelCapacity !== undefined) patch.fuelCapacity = Number(data.fuelCapacity);

      const updated = await tx.motorRepo.update(id, patch);

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'UPDATE_MOTORCYCLE',
        'Motorcycle',
        id,
        motor,
        updated
      );

      try {
        await broadcaster.publish(tx, {
          type: 'motor.availability.changed',
          entityId: id,
          userId: null,
        });
      } catch {}

      return updated;
    });
  },

  async updateMotorStatus(id, newStatus, reqContext = {}) {
    const allowed = ['available', 'maintenance', 'inactive'];
    if (!allowed.includes(newStatus)) {
      throw new AppError('Status motor tidak valid', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return transaction(async (tx) => {
      if (tx.driver === 'postgres' && tx.client) {
        await tx.client.query('SELECT id FROM motorcycles WHERE id = $1 FOR UPDATE', [Number(id)]);
      }

      const motor = await tx.motorRepo.findById(id);
      if (!motor) {
        throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      if (newStatus === 'maintenance' || newStatus === 'inactive') {
        const todayStr = toISODate(getNowWIB());
        const conflictingBookings = await tx.bookingRepo.findConflictingForMotor(id, todayStr, '2099-12-31');
        if (conflictingBookings.length > 0) {
          const error = new AppError(
            `Motor tidak dapat diubah ke ${newStatus} karena memiliki ${conflictingBookings.length} booking aktif atau mendatang.`,
            409,
            ERROR_CODES.MOTOR_HAS_BOOKINGS
          );
          error.data = {
            conflictingBookings: conflictingBookings.map((b) => ({
              id: b.id,
              bookingCode: b.bookingCode || b.code,
              startDate: b.startDate,
              endDate: b.endDate,
              status: b.status,
            })),
          };
          throw error;
        }
      }

      const updated = await tx.motorRepo.update(id, { status: newStatus });

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'UPDATE_MOTOR_STATUS',
        'Motorcycle',
        id,
        { status: motor.status },
        { status: newStatus }
      );

      try {
        await broadcaster.publish(tx, {
          type: 'motor.availability.changed',
          entityId: id,
          userId: null,
        });
      } catch {}

      return updated;
    });
  },

  async addImages(id, newImageUrls, reqContext = {}) {
    const motor = await motorRepo.findById(id);
    if (!motor) {
      throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const currentImages = Array.isArray(motor.images) ? [...motor.images] : [];
    const urlsToAdd = Array.isArray(newImageUrls) ? newImageUrls : [newImageUrls];

    if (currentImages.length + urlsToAdd.length > 8) {
      throw new AppError(
        `Maksimal 8 foto per armada motor. Saat ini ada ${currentImages.length} foto, mencoba menambah ${urlsToAdd.length}.`,
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const updatedImages = [...currentImages, ...urlsToAdd];

    return transaction(async (tx) => {
      const updated = await tx.motorRepo.update(id, { images: updatedImages });

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'ADD_MOTOR_IMAGES',
        'Motorcycle',
        id,
        { imagesCount: currentImages.length },
        { imagesCount: updatedImages.length }
      );

      return updated;
    });
  },

  async reorderImages(id, imageUrls, reqContext = {}) {
    if (!Array.isArray(imageUrls)) {
      throw new AppError('imageUrls harus berupa array', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const motor = await motorRepo.findById(id);
    if (!motor) {
      throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    return transaction(async (tx) => {
      const updated = await tx.motorRepo.update(id, { images: imageUrls });

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'REORDER_MOTOR_IMAGES',
        'Motorcycle',
        id,
        { images: motor.images },
        { images: imageUrls }
      );

      return updated;
    });
  },

  async deleteImage(id, imageTarget, reqContext = {}) {
    const motor = await motorRepo.findById(id);
    if (!motor) {
      throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    let images = Array.isArray(motor.images) ? [...motor.images] : [];
    const index = images.findIndex((img, idx) => String(idx) === String(imageTarget) || img === imageTarget);

    if (index === -1) {
      throw new AppError('Foto tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    images.splice(index, 1);

    return transaction(async (tx) => {
      const updated = await tx.motorRepo.update(id, { images });

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'DELETE_MOTOR_IMAGE',
        'Motorcycle',
        id,
        { removedIndex: index },
        { remainingCount: images.length }
      );

      return updated;
    });
  },

  async deleteMotorcycle(id, reqContext = {}) {
    const motor = await motorRepo.findById(id);
    if (!motor) {
      throw new AppError('Armada motor tidak ditemukan', 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    return transaction(async (tx) => {
      // 1. Cek apakah ada transaksi sewa aktif/pending/confirmed
      if (tx.driver === 'postgres' && tx.client) {
        const activeRes = await tx.client.query(
          `SELECT booking_code, status FROM bookings
           WHERE motorcycle_id = $1 AND status IN ('pending', 'confirmed', 'active')
           LIMIT 1`,
          [Number(id)],
        );
        if (activeRes.rows.length > 0) {
          throw new AppError(
            `Motor tidak dapat dihapus karena masih terkait transaksi sewa aktif (${activeRes.rows[0].booking_code} - status: ${activeRes.rows[0].status}).`,
            409,
            'MOTOR_IN_USE',
          );
        }

        // Cek apakah ada riwayat booking selesai/batal
        const anyRes = await tx.client.query(
          'SELECT 1 FROM bookings WHERE motorcycle_id = $1 LIMIT 1',
          [Number(id)],
        );
        if (anyRes.rows.length > 0) {
          // Jika ada riwayat, soft-delete dengan mengubah status ke inactive
          await tx.motorRepo.update(id, { status: 'inactive' });
        } else {
          // Hapus relasi gambar, fitur, dan baris motor secara bersih
          await tx.client.query('DELETE FROM motorcycle_images WHERE motorcycle_id = $1', [Number(id)]);
          await tx.client.query('DELETE FROM motorcycle_features WHERE motorcycle_id = $1', [Number(id)]);
          await tx.client.query('DELETE FROM gps_devices WHERE motorcycle_id = $1', [Number(id)]);
          await tx.motorRepo.delete(id);
        }
      } else {
        await tx.motorRepo.delete(id);
      }

      await recordAudit(
        tx.auditRepo,
        reqContext,
        'DELETE_MOTORCYCLE',
        'Motorcycle',
        id,
        motor,
        null,
      );

      await broadcaster.publish(tx, {
        type: 'motor.availability.changed',
        entityId: String(id),
        userId: null,
        payload: { motorId: id, action: 'deleted' },
      });

      return { success: true, message: `Armada motor ${motor.name} (${motor.plate || motor.plateNumber}) berhasil dihapus.` };
    });
  },
};

module.exports = adminMotorService;
