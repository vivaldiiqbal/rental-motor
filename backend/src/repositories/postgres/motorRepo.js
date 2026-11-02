const { pool } = require('../../../db/pool');
const { mapMotorcycle } = require('./mappers');
const { handlePgError } = require('./errors');

const BASE_SELECT = `
  SELECT
    m.*,
    COALESCE(
      (SELECT json_agg(mi.url ORDER BY mi.position ASC, mi.id ASC)
       FROM motorcycle_images mi WHERE mi.motorcycle_id = m.id),
      '[]'::json
    ) AS images,
    COALESCE(
      (SELECT json_agg(mf.feature ORDER BY mf.feature ASC)
       FROM motorcycle_features mf WHERE mf.motorcycle_id = m.id),
      '[]'::json
    ) AS features,
    (SELECT mi.url FROM motorcycle_images mi WHERE mi.motorcycle_id = m.id AND mi.is_primary = true LIMIT 1) AS primary_image
  FROM motorcycles m
`;

function escapeLike(str) {
  return String(str || '').replace(/([%_\\])/g, '\\$1');
}

const motorRepo = {
  async findById(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(`${BASE_SELECT} WHERE m.id = $1`, [Number(id)]);
      return res.rows.length > 0 ? mapMotorcycle(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findByPlate(plate, excludeId = null, client = null) {
    if (!plate) return null;
    const db = client || pool;
    try {
      const cleanPlate = plate.replace(/\s+/g, '').toUpperCase();
      const res = await db.query(
        `${BASE_SELECT}
         WHERE upper(replace(m.plate_number, ' ', '')) = $1
           AND ($2::int IS NULL OR m.id <> $2::int)
         LIMIT 1`,
        [cleanPlate, excludeId ? Number(excludeId) : null],
      );
      return res.rows.length > 0 ? mapMotorcycle(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findBySlug(slug, client = null) {
    if (!slug) return null;
    const db = client || pool;
    try {
      const res = await db.query(`${BASE_SELECT} WHERE m.slug = $1`, [slug.trim()]);
      return res.rows.length > 0 ? mapMotorcycle(res.rows[0]) : null;
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findAll(filter = {}, paging = {}, client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.status) {
        const dbStatus = filter.status === 'available' ? 'active' : filter.status;
        params.push(dbStatus);
        conditions.push(`m.status = $${params.length}`);
      }
      if (filter.type) {
        params.push(filter.type);
        conditions.push(`m.type = $${params.length}`);
      }
      if (filter.brand) {
        params.push(filter.brand);
        conditions.push(`m.brand = $${params.length}`);
      }
      if (filter.search) {
        const escaped = `%${escapeLike(filter.search.toLowerCase())}%`;
        params.push(escaped);
        const pNum = `$${params.length}`;
        conditions.push(
          `(lower(m.name) LIKE ${pNum} OR lower(m.brand) LIKE ${pNum} OR lower(m.plate_number) LIKE ${pNum} OR lower(m.type) LIKE ${pNum})`,
        );
      }
      if (filter.ids && Array.isArray(filter.ids) && filter.ids.length > 0) {
        const numericIds = filter.ids.map(Number).filter((n) => !isNaN(n));
        if (numericIds.length > 0) {
          params.push(numericIds);
          conditions.push(`m.id = ANY($${params.length}::int[])`);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM motorcycles m ${whereClause}`, params);
      const total = countRes.rows[0].total;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.max(1, parseInt(paging.limit, 10) || 50);
      const offset = (page - 1) * limit;

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `${BASE_SELECT} ${whereClause} ORDER BY m.id ASC LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      return {
        items: res.rows.map(mapMotorcycle),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async search(filter = {}, paging = {}, sort = 'popular', client = null) {
    const db = client || pool;
    try {
      const conditions = [];
      const params = [];

      if (filter.status) {
        const dbStatus = filter.status === 'available' ? 'active' : filter.status;
        params.push(dbStatus);
        conditions.push(`m.status = $${params.length}`);
      }

      if (filter.q) {
        const escapedQ = filter.q.trim().replace(/[%_\\]/g, '\\$&');
        params.push(`%${escapedQ}%`);
        conditions.push(`(m.name ILIKE $${params.length} OR m.brand ILIKE $${params.length} OR m.type ILIKE $${params.length})`);
      }

      if (filter.types && Array.isArray(filter.types) && filter.types.length > 0) {
        params.push(filter.types);
        conditions.push(`m.type = ANY($${params.length}::varchar[])`);
      }

      if (filter.brands && Array.isArray(filter.brands) && filter.brands.length > 0) {
        params.push(filter.brands);
        conditions.push(`m.brand = ANY($${params.length}::varchar[])`);
      }

      if (filter.transmission) {
        params.push(filter.transmission);
        conditions.push(`m.transmission = $${params.length}`);
      }

      if (filter.minPrice !== undefined && !isNaN(filter.minPrice)) {
        params.push(parseInt(filter.minPrice, 10));
        conditions.push(`m.price_per_day >= $${params.length}`);
      }
      if (filter.maxPrice !== undefined && !isNaN(filter.maxPrice)) {
        params.push(parseInt(filter.maxPrice, 10));
        conditions.push(`m.price_per_day <= $${params.length}`);
      }

      if (filter.minRating !== undefined && !isNaN(filter.minRating) && filter.minRating > 0) {
        params.push(parseFloat(filter.minRating));
        conditions.push(`m.rating_avg >= $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM motorcycles m ${whereClause}`, params);
      const total = countRes.rows[0].total;

      const sortMap = {
        'price_asc': 'ORDER BY m.price_per_day ASC, m.id ASC',
        'price-asc': 'ORDER BY m.price_per_day ASC, m.id ASC',
        'price_desc': 'ORDER BY m.price_per_day DESC, m.id ASC',
        'price-desc': 'ORDER BY m.price_per_day DESC, m.id ASC',
        'rating': 'ORDER BY m.rating_avg DESC, m.rating_count DESC, m.id ASC',
        'newest': 'ORDER BY m.year DESC, m.id DESC',
        'popular': 'ORDER BY m.rental_count DESC, m.rating_avg DESC, m.id ASC',
      };
      const orderClause = sortMap[sort] || sortMap.popular;

      const page = Math.max(1, parseInt(paging.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(paging.limit, 10) || 12));
      const offset = (page - 1) * limit;

      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;

      const res = await db.query(
        `${BASE_SELECT} ${whereClause} ${orderClause} LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      );

      return {
        items: res.rows.map(mapMotorcycle),
        total,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findSimilar(motorId, limit = 4, client = null) {
    const db = client || pool;
    try {
      const current = await this.findById(motorId, db);
      if (!current) return [];

      const res = await db.query(
        `${BASE_SELECT}
         WHERE m.id != $1 AND m.status = 'active' AND (m.type = $2 OR m.brand = $3)
         ORDER BY m.rental_count DESC, m.rating_avg DESC
         LIMIT $4`,
        [Number(motorId), current.type, current.brand, limit],
      );

      return res.rows.map(mapMotorcycle);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async findFeatured(limit = 6, client = null) {
    const db = client || pool;
    try {
      const res = await db.query(
        `${BASE_SELECT}
         WHERE m.status = 'active'
         ORDER BY m.rating_avg DESC, m.rental_count DESC, m.id ASC
         LIMIT $1`,
        [limit],
      );
      return res.rows.map(mapMotorcycle);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getDistinctBrands(client = null) {
    const db = client || pool;
    try {
      const res = await db.query("SELECT DISTINCT brand FROM motorcycles WHERE status = 'active' ORDER BY brand ASC");
      return res.rows.map((r) => r.brand);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getAdminFilterOptions(client = null) {
    const db = client || pool;
    try {
      const [brandsRes, typesRes] = await Promise.all([
        db.query("SELECT DISTINCT brand FROM motorcycles WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand ASC"),
        db.query("SELECT DISTINCT type FROM motorcycles WHERE type IS NOT NULL AND type <> '' ORDER BY type ASC"),
      ]);
      return {
        brands: brandsRes.rows.map((r) => r.brand),
        types: typesRes.rows.map((r) => r.type),
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async getPriceRange(client = null) {
    const db = client || pool;
    try {
      const res = await db.query('SELECT MIN(price_per_day)::int AS min, MAX(price_per_day)::int AS max FROM motorcycles');
      return {
        min: res.rows[0]?.min || 75000,
        max: res.rows[0]?.max || 250000,
      };
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async create(motorData, client = null) {
    const db = client || pool;
    try {
      const {
        slug,
        name,
        brand,
        type,
        cc,
        year,
        color,
        transmission,
        fuelCapacity = 4.2,
        pricePerDay,
        deposit = 200000,
        description = '',
        features = [],
        images = [],
        status = 'active',
        plate,
        plateNumber,
      } = motorData;

      const finalStatus = status === 'available' ? 'active' : status;
      const finalPlate = plateNumber || plate || `DK ${Date.now() % 10000} RK`;

      const res = await db.query(
        `INSERT INTO motorcycles (
           slug, name, brand, type, cc, year, color, transmission, fuel_capacity,
           price_per_day, deposit, description, plate_number, status,
           rating_avg, rating_count, rental_count
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 5.0, 0, 0)
         RETURNING id`,
        [
          slug,
          name,
          brand,
          type,
          Number(cc),
          Number(year),
          color,
          transmission,
          Number(fuelCapacity),
          Number(pricePerDay),
          Number(deposit),
          description,
          finalPlate,
          finalStatus,
        ],
      );

      const newId = res.rows[0].id;

      // Masukkan gambar ke motorcycle_images
      if (Array.isArray(images)) {
        for (let i = 0; i < images.length; i++) {
          await db.query(
            `INSERT INTO motorcycle_images (motorcycle_id, url, position, is_primary)
             VALUES ($1, $2, $3, $4)`,
            [newId, images[i], i, i === 0],
          );
        }
      }

      // Masukkan fitur ke motorcycle_features
      if (Array.isArray(features)) {
        for (const feat of features) {
          await db.query(
            `INSERT INTO motorcycle_features (motorcycle_id, feature)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [newId, feat],
          );
        }
      }

      return this.findById(newId, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async update(id, patch, client = null) {
    const db = client || pool;
    try {
      const setClauses = [];
      const params = [Number(id)];

      const fieldMap = {
        name: 'name',
        slug: 'slug',
        brand: 'brand',
        type: 'type',
        cc: 'cc',
        year: 'year',
        color: 'color',
        transmission: 'transmission',
        fuelCapacity: 'fuel_capacity',
        pricePerDay: 'price_per_day',
        deposit: 'deposit',
        description: 'description',
        plateNumber: 'plate_number',
        plate: 'plate_number',
        odometer: 'odometer_km',
        odometerKm: 'odometer_km',
        ratingAvg: 'rating_avg',
        rating: 'rating_avg',
        ratingCount: 'rating_count',
        reviewCount: 'rating_count',
        rentalCount: 'rental_count',
      };

      const assignedCols = new Set();
      for (const [key, col] of Object.entries(fieldMap)) {
        if (patch[key] !== undefined && !assignedCols.has(col)) {
          assignedCols.add(col);
          params.push(patch[key]);
          setClauses.push(`${col} = $${params.length}`);
        }
      }

      if (patch.status !== undefined) {
        const dbStatus = patch.status === 'available' ? 'active' : patch.status;
        params.push(dbStatus);
        setClauses.push(`status = $${params.length}`);
      }

      if (setClauses.length > 0) {
        await db.query(
          `UPDATE motorcycles SET ${setClauses.join(', ')} WHERE id = $1`,
          params,
        );
      }

      // Sinkronkan gambar jika diberikan di patch
      if (patch.images !== undefined && Array.isArray(patch.images)) {
        await db.query('DELETE FROM motorcycle_images WHERE motorcycle_id = $1', [Number(id)]);
        for (let i = 0; i < patch.images.length; i++) {
          await db.query(
            `INSERT INTO motorcycle_images (motorcycle_id, url, position, is_primary)
             VALUES ($1, $2, $3, $4)`,
            [Number(id), patch.images[i], i, i === 0],
          );
        }
      }

      // Sinkronkan fitur jika diberikan di patch
      if (patch.features !== undefined && Array.isArray(patch.features)) {
        await db.query('DELETE FROM motorcycle_features WHERE motorcycle_id = $1', [Number(id)]);
        for (const feat of patch.features) {
          await db.query(
            `INSERT INTO motorcycle_features (motorcycle_id, feature)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [Number(id), feat],
          );
        }
      }

      return this.findById(id, db);
    } catch (err) {
      throw handlePgError(err);
    }
  },

  async delete(id, client = null) {
    const db = client || pool;
    try {
      const res = await db.query('DELETE FROM motorcycles WHERE id = $1', [Number(id)]);
      return res.rowCount > 0;
    } catch (err) {
      throw handlePgError(err);
    }
  },
};

module.exports = motorRepo;
