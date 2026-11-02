const { motorRepo, bookingRepo, transaction } = require('../../repositories');
const { recordAudit } = require('../../middleware/audit');
const AppError = require('../../utils/AppError');
const { ERROR_CODES } = require('../../config/constants');
const { toISODate, getNowWIB } = require('../../utils/dates');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const adminMotorService = {
  async getMotorcycles(query = {}) {
    const { status, brand, type, search } = query;
    const filter = {};
    if (status) filter.status = status;
    if (brand) filter.brand = brand;
    if (type) filter.type = type;

    const result = await motorRepo.findAll(filter, { page: 1, limit: 1000 });
    let items = result.items;

    if (search) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (m) =>
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.brand && m.brand.toLowerCase().includes(q)) ||
          (m.plate && m.plate.toLowerCase().includes(q)) ||
          (m.type && m.type.toLowerCase().includes(q))
      );
    }

    return {
      items,
      total: items.length,
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
};

module.exports = adminMotorService;
