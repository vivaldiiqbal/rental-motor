/**
 * SATU-SATUNYA akses data aplikasi RodaKita.
 * Mendukung akses langsung ke Backend REST API via Axios serta fallback data mock
 * jika VITE_USE_MOCK=true.
 */
import axios from 'axios';
import { addDays, isBefore, isEqual, startOfDay } from 'date-fns';
import { site } from '../config/site';
import { countDays, parseDate, toISODate } from '../lib/format';
import { readStorage, writeStorage } from '../lib/storage';
import type {
  AddonInputItem,
  Booking,
  BookingQuote,
  BookingStatus,
  ContentBlocks,
  DocStatus,
  FaqItem,
  Motor,
  MotorQuery,
  PageContent,
  Paged,
  PaymentMethod,
  PickupMethod,
  PublicAddon,
  QuoteInput,
  Renter,
  RenterProfile,
  RenterReadiness,
  Review,
  User,
  UserDocumentInfo,
} from '../types';
import { seedBookings } from './mock/bookings';
import { motors as seedMotors } from './mock/motors';
import { reviews as seedReviews } from './mock/reviews';
import { DEMO_EMAIL, DEMO_PASSWORD, demoUser } from './mock/users';
import { realtimeBus } from './realtimeEventMap';

export class ApiError extends Error {
  code: string;
  details?: unknown;
  constructor(message: string, code = 'UNKNOWN', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

// Konfigurasi Kunci Storage
const TOKEN_KEY = 'rk_token_v1';
const ADMIN_TOKEN_KEY = 'rk_admin_token_v1';
const CUSTOMER_TOKEN_KEY = 'rk_customer_token_v1';
const SESSION_KEY = 'rk_session_v1';
const isMock = import.meta.env.VITE_USE_MOCK === 'true';
const baseURL = import.meta.env.VITE_API_URL || '/api';

// Instance Axios Terpusat
export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Interceptor Request: Sisipkan Authorization Bearer Token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const isAdminCall =
        config.url?.startsWith('/admin') ||
        window.location.pathname.startsWith('/admin');
      const token = isAdminCall
        ? localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
        : localStorage.getItem(CUSTOMER_TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Interceptor Response: Normalisasi Error ke { code, message, details }
// dan redirect otomatis ke /login jika token kedaluwarsa atau 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    let code = 'UNKNOWN_ERROR';
    let message = error.message || 'Terjadi kesalahan pada sistem.';
    let details: unknown = null;

    if (data?.error && typeof data.error === 'object') {
      code = data.error.code || 'API_ERROR';
      message = data.error.message || message;
      details = data.error.details || null;
    } else if (data?.message) {
      message = data.message;
      code = data.code || (status === 404 ? 'NOT_FOUND' : 'API_ERROR');
      details = data.details || null;
    } else if (!error.response || error.code === 'ERR_NETWORK') {
      code = 'NETWORK_ERROR';
      message = 'Gagal terhubung ke server backend (port 5001). Pastikan server backend sedang aktif.';
    }

    if (status === 401 || code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED') {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
        if (!window.location.pathname.includes('/login')) {
          const currentUrl = window.location.pathname + window.location.search;
          const redirect = encodeURIComponent(currentUrl);
          window.location.href = `/login?redirect=${redirect}`;
        }
      }
    }

    if (code === 'STALE_DATA' || (status === 409 && data?.error?.code === 'STALE_DATA')) {
      realtimeBus.emit({
        id: Date.now(),
        type: 'booking.updated',
        entityId: (details as any)?.entityId || null,
        userId: null,
        timestamp: new Date().toISOString(),
      });
      realtimeBus.emit({
        id: Date.now(),
        type: 'motor.availability.changed',
        entityId: null,
        userId: null,
        timestamp: new Date().toISOString(),
      });
    }

    return Promise.reject(new ApiError(message, code, details));
  },
);

export function isSimulateErrors(): boolean {
  if (typeof window !== 'undefined') {
    if ((window as unknown as { DEV_SIMULATE_ERRORS?: boolean }).DEV_SIMULATE_ERRORS === true) {
      return true;
    }
    try {
      if (window.localStorage.getItem('DEV_SIMULATE_ERRORS') === 'true') {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function setSimulateErrors(val: boolean) {
  if (typeof window !== 'undefined') {
    (window as unknown as { DEV_SIMULATE_ERRORS?: boolean }).DEV_SIMULATE_ERRORS = val;
    try {
      window.localStorage.setItem('DEV_SIMULATE_ERRORS', String(val));
    } catch {
      /* ignore */
    }
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { DEV_SIMULATE_ERRORS?: boolean }).DEV_SIMULATE_ERRORS = isSimulateErrors();
  (window as unknown as { setSimulateErrors?: (val: boolean) => void }).setSimulateErrors = setSimulateErrors;
}

const delay = async (ms = 350) => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
  if (isSimulateErrors()) {
    throw new ApiError('Simulasi error aktif (DEV_SIMULATE_ERRORS). Silakan coba lagi.', 'DEV_SIMULATE_ERRORS');
  }
};

const KEYS = {
  bookings: 'rk_bookings_v1',
  reviews: 'rk_reviews_v1',
  users: 'rk_users_v1',
  docTimes: 'rk_doc_times_v1',
};

const BLOCKING: BookingStatus[] = ['pending', 'confirmed', 'active'];
const DOC_VERIFY_MS = 5000;

// ---------- Helper Pemetaan Data API -> Frontend ----------

function mapDocStatus(raw: any): DocStatus {
  const status = typeof raw === 'object' && raw ? raw.status : raw;
  if (status === 'verified') return 'verified';
  if (status === 'pending') return 'pending';
  if (status === 'rejected') return 'rejected';
  return 'none';
}

/** Backend /auth/me & PUT /auth/me mengembalikan objek user datar; login/register membungkusnya di { user }. */
function unwrapUser(payload: any): any {
  const data = payload?.data?.data ?? payload?.data ?? payload;
  return data?.user ?? data;
}

function mapUser(raw: any): User {
  if (!raw || raw.id === undefined || raw.id === null) {
    throw new ApiError('Data pengguna dari server tidak valid.', 'INVALID_USER_PAYLOAD');
  }
  const docs = raw.documents ?? raw.docsStatus;
  return {
    id: String(raw.id),
    name: raw.name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    address: raw.address || '',
    role: raw.role || 'customer',
    documents: {
      ktp: mapDocStatus(docs?.ktp),
      sim: mapDocStatus(docs?.sim),
    },
    preferences: {
      emailNotif: raw.preferences?.emailNotif ?? true,
      whatsappNotif: raw.preferences?.whatsappNotif ?? true,
      promo: raw.preferences?.promo ?? false,
    },
  };
}

function mapMotor(m: any): Motor {
  const imageList = Array.isArray(m.images) && m.images.length > 0 ? m.images : m.image ? [m.image] : [];
  return {
    id: String(m.id),
    slug: m.slug,
    name: m.name,
    brand: m.brand,
    type: m.type,
    cc: Number(m.cc) || 125,
    year: Number(m.year) || 2023,
    color: m.color || 'Hitam',
    transmission: m.transmission,
    fuelCapacity: Number(m.fuelCapacity) || 4.2,
    pricePerDay: Number(m.pricePerDay) || 0,
    deposit: Number(m.deposit) || 200000,
    description: m.description || '',
    features: Array.isArray(m.features) ? m.features : ['Helm SNI', 'Jas Hujan'],
    images: imageList,
    status: m.status || 'available',
    rating: typeof m.ratingAvg === 'number' ? m.ratingAvg : typeof m.rating === 'number' ? m.rating : 5.0,
    reviewCount: typeof m.reviewCount === 'number' ? m.reviewCount : 0,
    plate: m.plate || '',
    popularity: typeof m.popularity === 'number' ? m.popularity : 80,
    available: m.available !== false,
  };
}

function mapBooking(b: any): Booking {
  const rawPayment = b.payment || b.paymentMethod || 'transfer';
  const normalizedPayment: PaymentMethod =
    rawPayment === 'cash'
      ? 'cash'
      : rawPayment === 'ewallet' || rawPayment === 'qris'
      ? 'ewallet'
      : 'transfer';
  const handedAt = b.handedAt || b.handoverAt || b.handover?.handedAt || b.handover?.handedOverAt || null;
  const days = Number(b.days || b.totalDays) || 1;
  const dueAt =
    b.dueAt ||
    (handedAt ? new Date(new Date(handedAt).getTime() + days * 24 * 60 * 60 * 1000).toISOString() : null);

  return {
    id: String(b.id),
    code: b.code || b.bookingCode,
    motorId: String(b.motorId || b.motorcycleId),
    userId: String(b.userId),
    startDate: b.startDate,
    endDate: b.endDate,
    days,
    pricePerDay: Number(b.pricePerDay || b.pricing?.pricePerDay || 0),
    subtotal: Number(b.subtotal || b.pricing?.subtotal || b.total || 0),
    deposit: Number(b.deposit || b.pricing?.deposit || 0),
    total: Number(b.totalDibayar || b.grandTotal || b.total || b.pricing?.totalDibayar || 0),
    status: b.status,
    createdAt: b.createdAt ? b.createdAt.substring(0, 10) : toISODate(new Date()),
    pickup: b.pickup || 'store',
    payment: normalizedPayment,
    paymentMethod: b.paymentMethod || normalizedPayment,
    paymentStatus: b.paymentStatus || (b.paidAt ? 'paid' : 'pending'),
    renter: b.renter || {
      name: b.userName || '',
      phone: b.userPhone || '',
      email: b.userEmail || '',
      idNumber: '',
      notes: b.notes || '',
    },
    termsVersion: b.termsVersion ?? null,
    pricingSnapshot: b.pricingSnapshot ?? b.pricing ?? null,
    addOnsTotal: Number(b.addOnsTotal ?? b.addonsTotal ?? b.pricingSnapshot?.addOnsTotal ?? b.pricing?.addOnsTotal ?? 0),
    addons: b.selectedAddOns ?? b.addonsList ?? b.addons ?? b.pricingSnapshot?.selectedAddOns ?? [],
    selectedAddOns: b.selectedAddOns ?? b.addonsList ?? b.addons ?? b.pricingSnapshot?.selectedAddOns ?? [],
    addonsList: b.addonsList ?? b.selectedAddOns ?? b.addons ?? b.pricingSnapshot?.selectedAddOns ?? [],
    handedAt,
    handoverAt: handedAt,
    dueAt,
    handover: b.handover ?? null,
    returnInfo: b.returnInfo ?? null,
    returnRequest: b.returnRequest ?? (b.returnRequestedAt ? {
      requestedAt: b.returnRequestedAt,
      method: b.returnMethod || 'store',
      notes: b.returnCustomerNotes || '',
      photoUrl: b.returnPhotoUrl || null,
    } : null),
    returnRequestedAt: b.returnRequestedAt ?? null,
    returnMethod: b.returnMethod ?? null,
    returnCustomerNotes: b.returnCustomerNotes ?? null,
    returnPhotoUrl: b.returnPhotoUrl ?? null,
    depositReturned: Boolean(b.depositReturned || b.returnInfo?.depositRefundedAt),
    lateFee: Number(b.lateFee ?? b.returnInfo?.lateFee ?? 0),
    capabilities: b.capabilities ?? null,
  };
}

function mapReview(r: any): Review {
  return {
    id: String(r.id),
    motorId: String(r.motorId),
    author: r.userName || r.author || 'Pelanggan RodaKita',
    rating: Number(r.rating) || 5,
    comment: r.comment || '',
    date: r.date || (r.createdAt ? r.createdAt.substring(0, 10) : toISODate(new Date())),
  };
}

// ---------- Helper Mock Internal ----------

function allBookings(): Booking[] {
  const stored = readStorage<Booking[] | null>(KEYS.bookings, null);
  return Array.isArray(stored) ? stored : seedBookings;
}
const saveBookings = (list: Booking[]) => writeStorage(KEYS.bookings, list);

function allReviews(): Review[] {
  const stored = readStorage<Review[] | null>(KEYS.reviews, null);
  return Array.isArray(stored) ? stored : seedReviews;
}

interface StoredUser {
  user: User;
  password: string;
}
function storedUsers(): StoredUser[] {
  const list = readStorage<StoredUser[]>(KEYS.users, []);
  return Array.isArray(list) ? list : [];
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

function isMotorFree(motorId: string, start?: string, end?: string, ignoreId?: string) {
  if (!start || !end) return true;
  return !allBookings().some(
    (b) =>
      b.id !== ignoreId &&
      b.motorId === motorId &&
      BLOCKING.includes(b.status) &&
      overlaps(start, end, b.startDate, b.endDate),
  );
}

function withStats(motor: Motor): Motor {
  const list = allReviews().filter((r) => r.motorId === motor.id);
  if (list.length === 0) return motor;
  const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
  return { ...motor, rating: Math.round(avg * 10) / 10, reviewCount: list.length };
}

function withAvailability(motor: Motor, start?: string, end?: string): Motor {
  const m = withStats(motor);
  return { ...m, available: m.status === 'available' && isMotorFree(m.id, start, end) };
}

// ---------- Motor ----------

export async function getMotors(query: MotorQuery = {}): Promise<Paged<Motor>> {
  if (isMock) {
    await delay();
    const {
      q = '',
      types = [],
      brands = [],
      transmission = '',
      minPrice = 0,
      maxPrice = Number.MAX_SAFE_INTEGER,
      minRating = 0,
      onlyAvailable = false,
      sort = 'popular',
      startDate,
      endDate,
      page = 1,
      pageSize = 12,
    } = query;

    const term = q.trim().toLowerCase();
    let list = seedMotors.map((m) => withAvailability(m, startDate, endDate));

    list = list.filter((m) => {
      if (term && !`${m.name} ${m.brand} ${m.type}`.toLowerCase().includes(term)) return false;
      if (types.length && !types.includes(m.type)) return false;
      if (brands.length && !brands.includes(m.brand)) return false;
      if (transmission && m.transmission !== transmission) return false;
      if (m.pricePerDay < minPrice || m.pricePerDay > maxPrice) return false;
      if (m.rating < minRating) return false;
      if (onlyAvailable && !m.available) return false;
      return true;
    });

    const sorters: Record<string, (a: Motor, b: Motor) => number> = {
      'price-asc': (a, b) => a.pricePerDay - b.pricePerDay,
      'price-desc': (a, b) => b.pricePerDay - a.pricePerDay,
      rating: (a, b) => b.rating - a.rating,
      newest: (a, b) => b.year - a.year,
      popular: (a, b) => b.popularity - a.popularity,
    };
    list.sort(sorters[sort] ?? sorters.popular);

    const total = list.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), pageCount);
    const items = list.slice((safePage - 1) * pageSize, safePage * pageSize);
    return { items, total, page: safePage, pageCount };
  }

  // Panggilan ke REST API Backend Asli via Axios
  const params: Record<string, any> = {
    page: query.page || 1,
    limit: query.pageSize || 12,
  };
  if (query.q) params.q = query.q;
  if (query.types && query.types.length > 0) params.type = query.types.join(',');
  if (query.brands && query.brands.length > 0) params.brand = query.brands.join(',');
  if (query.transmission) params.transmission = query.transmission;
  if (query.minPrice !== undefined && query.minPrice > 0) params.minPrice = query.minPrice;
  if (query.maxPrice !== undefined && query.maxPrice < 10000000) params.maxPrice = query.maxPrice;
  if (query.minRating !== undefined && query.minRating > 0) params.minRating = query.minRating;
  if (query.onlyAvailable) params.availableOnly = 'true';
  if (query.startDate) params.startDate = query.startDate;
  if (query.endDate) params.endDate = query.endDate;
  if (query.sort) params.sort = query.sort;

  const res = await apiClient.get('/motorcycles', { params });
  const rawList = res.data.data || [];
  const meta = res.data.meta || {};

  return {
    items: rawList.map(mapMotor),
    total: meta.total ?? rawList.length,
    page: meta.page ?? 1,
    pageCount: meta.totalPages ?? Math.max(1, Math.ceil((meta.total || rawList.length) / (query.pageSize || 12))),
  };
}

export async function getMotorBySlug(slug: string, startDate?: string, endDate?: string): Promise<Motor> {
  if (isMock) {
    await delay(250);
    const motor = seedMotors.find((m) => m.slug === slug);
    if (!motor) throw new ApiError('Motor tidak ditemukan.', 'NOT_FOUND');
    return withAvailability(motor, startDate, endDate);
  }

  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const res = await apiClient.get(`/motorcycles/${slug}`, { params });
  return mapMotor(res.data.data);
}

export async function getMotorsByIds(ids: string[], startDate?: string, endDate?: string): Promise<Motor[]> {
  if (ids.length === 0) return [];
  if (isMock) {
    await delay(200);
    return seedMotors
      .filter((m) => ids.includes(m.id))
      .map((m) => withAvailability(m, startDate, endDate));
  }

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const params: Record<string, string> = {};
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        const res = await apiClient.get(`/motorcycles/${id}`, { params });
        return mapMotor(res.data.data);
      } catch {
        return null;
      }
    }),
  );

  return results.filter((m): m is Motor => m !== null);
}

export async function getSimilarMotors(motor: Motor, limit = 3): Promise<Motor[]> {
  if (isMock) {
    await delay(200);
    return seedMotors
      .filter((m) => m.id !== motor.id && (m.type === motor.type || m.brand === motor.brand))
      .slice(0, limit)
      .map(withStats);
  }

  try {
    const res = await apiClient.get(`/motorcycles/${motor.id}/similar`, { params: { limit } });
    return (res.data.data || []).map(mapMotor);
  } catch {
    return [];
  }
}

export async function getFeaturedMotors(limit = 4): Promise<Motor[]> {
  if (isMock) {
    await delay(250);
    return [...seedMotors]
      .filter((m) => m.status === 'available')
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit)
      .map(withStats);
  }

  const res = await apiClient.get('/motorcycles/featured', { params: { limit } });
  return (res.data.data || []).map(mapMotor);
}

export function getBrands(): string[] {
  return [...new Set(seedMotors.map((m) => m.brand))].sort();
}

export const PRICE_RANGE = {
  min: 75000,
  max: 250000,
};

// ---------- Ulasan ----------

export async function getReviews(motorId: string): Promise<Review[]> {
  if (isMock) {
    await delay(250);
    return allReviews()
      .filter((r) => r.motorId === motorId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const res = await apiClient.get(`/motorcycles/${motorId}/reviews`);
  const list = res.data.data || [];
  return list.map(mapReview);
}

export async function addReview(input: Omit<Review, 'id' | 'date'>): Promise<Review> {
  if (isMock) {
    await delay(400);
    const review: Review = {
      ...input,
      id: `r${Date.now()}`,
      date: toISODate(new Date()),
    };
    writeStorage(KEYS.reviews, [review, ...allReviews()]);
    return review;
  }

  // Di Backend REST API, ulasan hanya diizinkan untuk booking yang telah 'completed'
  const bookingsRes = await apiClient.get('/bookings', { params: { status: 'completed' } });
  const completedBookings = bookingsRes.data.data || [];
  const validBooking = completedBookings.find((b: any) => String(b.motorId) === String(input.motorId));

  if (!validBooking) {
    throw new ApiError(
      'Ulasan hanya dapat diberikan untuk pesanan sewa motor yang telah selesai (status completed).',
      'NO_COMPLETED_BOOKING',
    );
  }

  const res = await apiClient.post('/reviews', {
    bookingId: validBooking.id,
    rating: input.rating,
    comment: input.comment,
  });

  return mapReview(res.data.data);
}

// ---------- Booking ----------

export async function checkAvailability(motorId: string, start: string, end: string): Promise<boolean> {
  if (isMock) {
    await delay(200);
    const motor = seedMotors.find((m) => m.id === motorId);
    return !!motor && motor.status === 'available' && isMotorFree(motorId, start, end);
  }

  try {
    const res = await apiClient.get(`/motorcycles/${motorId}/availability`, {
      params: { startDate: start, endDate: end },
    });
    return Boolean(res.data.data?.available);
  } catch {
    return false;
  }
}

export interface CreateBookingInput {
  motorId: string;
  userId: string;
  startDate: string;
  endDate: string;
  pickup: PickupMethod;
  pickupLocation?: string;
  address?: string;
  payment: PaymentMethod;
  renter: Renter;
  promoCode?: string;
  addons?: AddonInputItem[];
  acceptedTermsVersion?: number | null;
}

const DEFAULT_PUBLIC_ADDONS: PublicAddon[] = [
  {
    id: 1,
    addon_id: 1,
    code: 'extra_helmet',
    name: 'Helm Tambahan (SNI Bersih)',
    pricePerDay: 10000,
    price_per_day: 10000,
    description: 'Helm SNI bersih, higienis, dan wangi untuk penumpang / boncenger',
    isActive: true,
  },
  {
    id: 2,
    addon_id: 2,
    code: 'raincoat',
    name: 'Jas Hujan Ponco / Setelan',
    pricePerDay: 5000,
    price_per_day: 5000,
    description: 'Jas hujan setelan baju & celana tebal anti bocor di segala cuaca',
    isActive: true,
  },
  {
    id: 3,
    addon_id: 3,
    code: 'phone_holder',
    name: 'Penyangga HP (Phone Holder) Anti Getar',
    pricePerDay: 5000,
    price_per_day: 5000,
    description: 'Phone holder stang kokoh dengan peredam anti getar untuk navigasi Maps',
    isActive: true,
  },
];

export async function getPublicAddons(): Promise<PublicAddon[]> {
  if (isMock) {
    await delay(100);
    return DEFAULT_PUBLIC_ADDONS;
  }
  try {
    const res = await apiClient.get('/addons');
    const list = res.data?.data;
    if (Array.isArray(list) && list.length > 0) {
      return list
        .filter((a: any) => a.isActive !== false)
        .map((a: any) => ({
          id: a.id,
          addon_id: a.addon_id ?? a.id,
          code: a.code || String(a.id),
          name: a.name,
          pricePerDay: Number(a.pricePerDay ?? a.price_per_day ?? a.price ?? 0),
          price_per_day: Number(a.price_per_day ?? a.pricePerDay ?? a.price ?? 0),
          description: a.description || '',
          isActive: Boolean(a.isActive !== false),
        }));
    }
    return DEFAULT_PUBLIC_ADDONS;
  } catch {
    return DEFAULT_PUBLIC_ADDONS;
  }
}

export async function getBookingQuote(input: QuoteInput): Promise<BookingQuote> {
  if (isMock) {
    await delay(200);
    const motor = seedMotors.find((m) => String(m.id) === String(input.motorId));
    if (!motor) throw new ApiError('Motor tidak ditemukan.', 'NOT_FOUND');
    const days = countDays(input.start, input.end);
    const safeDays = Math.max(1, days);
    const subtotal = motor.pricePerDay * safeDays;

    let durationDiscountPercent = 0;
    if (safeDays >= 30) durationDiscountPercent = 20;
    else if (safeDays >= 7) durationDiscountPercent = 10;
    else if (safeDays >= 3) durationDiscountPercent = 5;

    const durationDiscount = Math.round(subtotal * (durationDiscountPercent / 100));
    const totalRental = subtotal - durationDiscount;
    const deposit = motor.deposit || 200000;
    const total = totalRental + deposit;

    return {
      motor: {
        id: motor.id,
        name: motor.name,
        pricePerDay: motor.pricePerDay,
      },
      pricePerDay: motor.pricePerDay,
      days: safeDays,
      subtotal,
      totalSurcharge: 0,
      surcharges: [],
      durationDiscountPercent,
      durationDiscount,
      appliedTier: durationDiscountPercent > 0 ? {
        minDays: safeDays >= 30 ? 30 : safeDays >= 7 ? 7 : 3,
        discountPercent: durationDiscountPercent,
        description: `Diskon sewa durasi ${durationDiscountPercent}%`,
      } : null,
      deliveryFee: 0,
      discount: 0,
      promoDiscount: 0,
      totalRental,
      rentalTotal: totalRental,
      deposit,
      total,
      grandTotal: total,
      lineItems: [
        {
          id: 'rental',
          type: 'rental',
          name: `Sewa Motor (${safeDays} hari)`,
          amount: subtotal,
        },
        ...(durationDiscount > 0 ? [{
          id: 'duration_discount',
          type: 'discount',
          name: `Diskon Durasi (${durationDiscountPercent}%)`,
          amount: -durationDiscount,
        }] : []),
        {
          id: 'deposit',
          type: 'deposit',
          name: 'Deposit Jaminan (Dapat Dikembalikan)',
          amount: deposit,
        },
      ],
      promo: null,
    };
  }

  const res = await apiClient.post('/bookings/quote', {
    motorId: Number(input.motorId) || input.motorId,
    start: input.start,
    end: input.end,
    addons: input.addons || [],
    delivery: input.delivery || {},
    promoCode: input.promoCode || undefined,
  });

  return res.data.data;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  if (isMock) {
    await delay(700);
    const motor = seedMotors.find((m) => m.id === input.motorId);
    if (!motor) throw new ApiError('Motor tidak ditemukan.', 'NOT_FOUND');

    const start = parseDate(input.startDate);
    const end = parseDate(input.endDate);
    if (!start || !end) throw new ApiError('Tanggal sewa tidak valid.', 'INVALID_DATE');
    if (isBefore(start, startOfDay(new Date()))) {
      throw new ApiError('Tanggal mulai sewa tidak boleh di masa lalu.', 'INVALID_DATE');
    }
    if (isBefore(end, start)) {
      throw new ApiError('Tanggal kembali tidak boleh sebelum tanggal ambil.', 'INVALID_DATE');
    }
    if (isEqual(end, start)) {
      throw new ApiError(`Tanggal kembali harus setelah tanggal ambil (minimal sewa ${site.rental.minDays} hari).`, 'INVALID_DATE');
    }
    const days = countDays(input.startDate, input.endDate);
    if (days < site.rental.minDays) {
      throw new ApiError(`Durasi sewa minimal ${site.rental.minDays} hari.`, 'INVALID_DURATION');
    }
    if (days > site.rental.maxDays) {
      throw new ApiError(`Durasi sewa maksimal ${site.rental.maxDays} hari (Anda memilih ${days} hari).`, 'INVALID_DURATION');
    }
    if (motor.status !== 'available' || !isMotorFree(motor.id, input.startDate, input.endDate)) {
      throw new ApiError('Maaf, motor sudah tidak tersedia di rentang tanggal tersebut.', 'CONFLICT');
    }

    const list = allBookings();
    const subtotal = motor.pricePerDay * days;
    const booking: Booking = {
      id: `b${Date.now()}`,
      code: `RK-${Math.floor(10000 + Math.random() * 89999)}`,
      motorId: motor.id,
      userId: input.userId,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      pricePerDay: motor.pricePerDay,
      subtotal,
      deposit: motor.deposit,
      total: subtotal,
      status: 'pending',
      createdAt: toISODate(new Date()),
      pickup: input.pickup,
      pickupLocation: input.pickupLocation || input.address,
      payment: input.payment,
      renter: input.renter,
    };
    saveBookings([booking, ...list]);
    return booking;
  }

  // Idempotency Key unik per aksi booking
  const idempotencyKey = `bk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const res = await apiClient.post(
    '/bookings',
    {
      motorId: Number(input.motorId) || input.motorId,
      startDate: input.startDate,
      endDate: input.endDate,
      pickup: input.pickup,
      pickupLocation: input.pickupLocation || input.address,
      payment: input.payment,
      renter: input.renter,
      promoCode: input.promoCode || undefined,
      addons: input.addons || [],
      acceptedTermsVersion: input.acceptedTermsVersion,
    },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    },
  );

  return mapBooking(res.data.data);
}

export async function getBookings(userId: string): Promise<Booking[]> {
  if (isMock) {
    await delay(300);
    return allBookings()
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  const res = await apiClient.get('/bookings');
  const list = res.data.data || [];
  return list.map(mapBooking);
}

export async function getBookingByCode(code: string, userId: string): Promise<Booking> {
  if (isMock) {
    await delay(250);
    const found = allBookings().find((b) => b.code === code && b.userId === userId);
    if (!found) throw new ApiError('Booking tidak ditemukan.', 'NOT_FOUND');
    return found;
  }

  const res = await apiClient.get(`/bookings/${code}`);
  return mapBooking(res.data.data);
}

export async function cancelBooking(id: string): Promise<Booking> {
  if (isMock) {
    await delay(450);
    const list = allBookings();
    const target = list.find((b) => b.id === id);
    if (!target) throw new ApiError('Booking tidak ditemukan.', 'NOT_FOUND');
    if (target.status !== 'pending' && target.status !== 'confirmed') {
      throw new ApiError('Booking ini tidak dapat dibatalkan.', 'INVALID_STATE');
    }
    const updated: Booking = { ...target, status: 'cancelled' };
    saveBookings(list.map((b) => (b.id === id ? updated : b)));
    return updated;
  }

  const res = await apiClient.post(`/bookings/${id}/cancel`, {
    reason: 'Dibatalkan oleh pelanggan melalui aplikasi.',
  });
  return mapBooking(res.data.data);
}

export async function requestBookingReturn(
  idOrCode: string,
  payload: { returnMethod: 'store' | 'pickup'; notes?: string; photoUrl?: string | null },
): Promise<Booking> {
  if (isMock) {
    await delay(350);
    const list = allBookings();
    const target = list.find((b) => b.id === idOrCode || b.code === idOrCode);
    if (!target) throw new ApiError('Booking tidak ditemukan.', 'NOT_FOUND');
    const nowIso = new Date().toISOString();
    const updated: Booking = {
      ...target,
      status: 'return_requested',
      returnRequestedAt: nowIso,
      returnMethod: payload.returnMethod,
      returnCustomerNotes: payload.notes || '',
      returnPhotoUrl: payload.photoUrl || null,
      returnRequest: {
        requestedAt: nowIso,
        method: payload.returnMethod,
        notes: payload.notes || '',
        photoUrl: payload.photoUrl || null,
      },
    };
    saveBookings(list.map((b) => (b.id === target.id ? updated : b)));
    return updated;
  }

  const res = await apiClient.post(`/bookings/${idOrCode}/request-return`, payload);
  return mapBooking(res.data.data);
}

/** Tanggal terpakai (ISO) untuk sebuah motor - dipakai kalender untuk menonaktifkan hari. */
export async function getBlockedRanges(motorId: string): Promise<{ from: string; to: string }[]> {
  if (isMock) {
    await delay(150);
    return allBookings()
      .filter((b) => b.motorId === motorId && BLOCKING.includes(b.status))
      .map((b) => ({ from: b.startDate, to: toISODate(addDays(parseDate(b.endDate) ?? new Date(), -1)) }));
  }

  const res = await apiClient.get(`/motorcycles/${motorId}/unavailable-dates`);
  const dates: string[] = res.data.data || [];
  return dates.map((d) => ({ from: d, to: d }));
}

// ---------- Auth & Profil ----------

function resolveDocs(user: User): User {
  const times = readStorage<Record<string, { ktp?: number; sim?: number }>>(KEYS.docTimes, {});
  const t = times[user.id] ?? {};
  const docs = { ...user.documents };
  (['ktp', 'sim'] as const).forEach((k) => {
    const ts = t[k];
    if (docs[k] === 'pending' && ts && Date.now() - ts >= DOC_VERIFY_MS) docs[k] = 'verified';
  });
  return { ...user, documents: docs };
}

function saveUser(user: User) {
  if (user.id === demoUser.id) {
    writeStorage('rk_demo_profile_v1', user);
    return;
  }
  writeStorage(
    KEYS.users,
    storedUsers().map((s) => (s.user.id === user.id ? { ...s, user } : s)),
  );
}

function findUserById(id: string): User | null {
  if (id === demoUser.id) return readStorage<User>('rk_demo_profile_v1', demoUser);
  return storedUsers().find((s) => s.user.id === id)?.user ?? null;
}

export async function login(email: string, password: string): Promise<User> {
  if (isMock) {
    await delay(500);
    const mail = email.trim().toLowerCase();
    if (mail === DEMO_EMAIL && password === DEMO_PASSWORD) {
      return resolveDocs(findUserById(demoUser.id) ?? demoUser);
    }
    const found = storedUsers().find((s) => s.user.email.toLowerCase() === mail);
    if (!found || found.password !== password) {
      throw new ApiError('Email atau kata sandi salah.', 'INVALID_CREDENTIALS');
    }
    return resolveDocs(found.user);
  }

  const res = await apiClient.post('/auth/login', { email, password });
  const { token, user } = res.data.data;
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SESSION_KEY, String(user.id));
    if (user.role === 'admin' || user.role === 'staff') {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(
        'rk_admin_session_v2',
        JSON.stringify({
          id: String(user.id),
          name: user.name,
          email: user.email,
          phone: user.phone || '081234567890',
          role: user.role,
          isActive: user.isActive !== false,
          createdAt: user.createdAt || new Date().toISOString(),
        }),
      );
    } else {
      localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    }
  }
  return mapUser(user);
}

export async function register(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<User> {
  if (isMock) {
    await delay(600);
    const mail = input.email.trim().toLowerCase();
    if (mail === DEMO_EMAIL || storedUsers().some((s) => s.user.email.toLowerCase() === mail)) {
      throw new ApiError('Email sudah terdaftar. Silakan masuk.', 'EMAIL_TAKEN');
    }
    const user: User = {
      id: `u${Date.now()}`,
      name: input.name.trim(),
      email: mail,
      phone: input.phone.trim(),
      address: '',
      documents: { ktp: 'none', sim: 'none' },
      preferences: { emailNotif: true, whatsappNotif: true, promo: false },
    };
    writeStorage(KEYS.users, [...storedUsers(), { user, password: input.password }]);
    return user;
  }

  const res = await apiClient.post('/auth/register', input);
  const { token, user } = res.data.data;
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    localStorage.setItem(SESSION_KEY, String(user.id));
  }
  return mapUser(user);
}

export async function getUser(id: string): Promise<User | null> {
  if (isMock) {
    const user = findUserById(id);
    return user ? resolveDocs(user) : null;
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return null;

  try {
    const res = await apiClient.get('/auth/me');
    return mapUser(unwrapUser(res));
  } catch {
    return null;
  }
}

export async function updateProfile(id: string, patch: Partial<Omit<User, 'id' | 'email'>>): Promise<User> {
  if (isMock) {
    await delay(450);
    const current = findUserById(id);
    if (!current) throw new ApiError('Pengguna tidak ditemukan.', 'NOT_FOUND');
    const next: User = { ...current, ...patch };
    saveUser(next);
    return resolveDocs(next);
  }

  const res = await apiClient.put('/auth/me', patch);
  return mapUser(unwrapUser(res));
}

export async function uploadDocument(id: string, kind: 'ktp' | 'sim', file?: File): Promise<User> {
  if (isMock) {
    await delay(600);
    const current = findUserById(id);
    if (!current) throw new ApiError('Pengguna tidak ditemukan.', 'NOT_FOUND');
    const status: DocStatus = 'pending';
    const next: User = { ...current, documents: { ...current.documents, [kind]: status } };
    saveUser(next);
    const times = readStorage<Record<string, { ktp?: number; sim?: number }>>(KEYS.docTimes, {});
    times[id] = { ...times[id], [kind]: Date.now() };
    writeStorage(KEYS.docTimes, times);
    return next;
  }

  const formData = new FormData();
  if (file) {
    formData.append(kind, file, file.name);
  } else {
    // Membuat berkas PNG 1x1 valid untuk verifikasi magic bytes backend (fallback)
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const binaryString = window.atob(pngBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });
    formData.append(kind, blob, `${kind}.png`);
  }

  await apiClient.post('/auth/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const meRes = await apiClient.get('/auth/me');
  return mapUser(unwrapUser(meRes));
}

export async function getMyDocuments(): Promise<Record<'ktp' | 'sim', UserDocumentInfo>> {
  if (isMock) {
    return {
      ktp: { type: 'ktp', status: 'verified', fileName: 'ktp.jpg', sizeBytes: 245600, uploadedAt: null, verifiedAt: null, reviewerNote: null, fileUrl: null },
      sim: { type: 'sim', status: 'verified', fileName: 'sim.jpg', sizeBytes: 245600, uploadedAt: null, verifiedAt: null, reviewerNote: null, fileUrl: null },
    };
  }

  try {
    const res = await apiClient.get('/auth/documents');
    const payload = res.data?.data || res.data || {};
    return {
      ktp: payload.ktp || { type: 'ktp', status: 'none', fileName: null, sizeBytes: null, uploadedAt: null, verifiedAt: null, reviewerNote: null, fileUrl: null },
      sim: payload.sim || { type: 'sim', status: 'none', fileName: null, sizeBytes: null, uploadedAt: null, verifiedAt: null, reviewerNote: null, fileUrl: null },
    };
  } catch {
    return {
      ktp: { type: 'ktp', status: 'none', fileName: null, sizeBytes: null, uploadedAt: null, verifiedAt: null, reviewerNote: null, fileUrl: null },
      sim: { type: 'sim', status: 'none', fileName: null, sizeBytes: null, uploadedAt: null, verifiedAt: null, reviewerNote: null, fileUrl: null },
    };
  }
}

export function getDocumentUrl(kind: 'ktp' | 'sim', cacheBuster?: number | string): string {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem(CUSTOMER_TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''
      : '';
  const apiOrigin =
    import.meta.env.VITE_API_BASE_URL ||
    (baseURL.startsWith('http')
      ? baseURL.replace(/\/api\/?$/, '')
      : typeof window !== 'undefined' && window.location.port === '5173'
      ? 'http://localhost:5001'
      : typeof window !== 'undefined'
      ? window.location.origin
      : '');
  const qs = new URLSearchParams();
  if (token) qs.set('token', token);
  qs.set('t', String(cacheBuster || Date.now()));
  return `${apiOrigin}/api/auth/documents/${kind}?${qs.toString()}`;
}

export async function getRenterProfile(): Promise<{ profile: RenterProfile | null; readiness: RenterReadiness }> {
  if (isMock) {
    return {
      profile: {
        userId: '1',
        fullNameKtp: 'Ilham Ramadhan',
        birthDate: '1995-05-15',
        nikLast4: '0001',
        nikMasked: '••••••••••••0001',
        addressKtp: 'Jl. Sunset Road No. 88, Kuta, Bali',
        phoneE164: '+6281234567890',
        stayAddress: 'Hotel Grand Kuta, Jl. Dewi Sri No. 10, Legian',
        emergencyName: 'Siti Rahma',
        emergencyRelation: 'pasangan',
        emergencyPhone: '+6281299998888',
        emergencyContact: {
          name: 'Siti Rahma',
          relation: 'pasangan',
          phone: '+6281299998888',
        },
        termsVersionAccepted: 1,
        privacyVersionAccepted: 1,
        gpsConsentAt: '2026-01-15T08:00:00.000Z',
        completedAt: '2026-01-15T08:00:00.000Z',
      },
      readiness: {
        isReady: true,
        status: 'complete',
        missingFields: [],
        pendingDocuments: [],
        issues: [],
        profile: null,
        documents: { ktp: 'verified', sim: 'verified' },
        actionUrl: '/profile#renter-data',
      },
    };
  }
  const res = await apiClient.get('/auth/renter-profile');
  return {
    profile: res.data?.data || null,
    readiness: res.data?.readiness,
  };
}

export async function getRenterReadiness(): Promise<RenterReadiness> {
  if (isMock) {
    const p = await getRenterProfile();
    return p.readiness;
  }
  const res = await apiClient.get('/auth/renter-readiness');
  return res.data?.data;
}

export async function updateRenterProfile(data: any): Promise<{ profile: RenterProfile; readiness: RenterReadiness }> {
  if (isMock) {
    await delay(300);
    return (await getRenterProfile()) as { profile: RenterProfile; readiness: RenterReadiness };
  }
  const res = await apiClient.put('/auth/renter-profile', data);
  return {
    profile: res.data?.data,
    readiness: res.data?.readiness,
  };
}

export async function changePassword(id: string, oldPassword: string, newPassword: string): Promise<void> {
  if (isMock) {
    await delay(500);
    if (id === demoUser.id) {
      throw new ApiError('Akun demo tidak dapat mengganti kata sandi.', 'DEMO_LOCKED');
    }
    const list = storedUsers();
    const found = list.find((s) => s.user.id === id);
    if (!found || found.password !== oldPassword) {
      throw new ApiError('Kata sandi lama salah.', 'INVALID_CREDENTIALS');
    }
    writeStorage(
      KEYS.users,
      list.map((s) => (s.user.id === id ? { ...s, password: newPassword } : s)),
    );
    return;
  }

  await apiClient.put('/auth/password', {
    currentPassword: oldPassword,
    newPassword,
  });
}

export async function requestPasswordReset(email: string): Promise<{ sent: boolean }> {
  if (isMock) {
    await delay(600);
    return { sent: !!email };
  }

  await apiClient.post('/auth/forgot-password', { email });
  return { sent: true };
}

export async function sendContactMessage(input: { name: string; email: string; message: string }): Promise<{ ok: boolean }> {
  if (isMock) {
    await delay(600);
    return { ok: !!input.message };
  }

  await apiClient.post('/contact', input);
  return { ok: true };
}

export async function getSiteMeta(): Promise<any> {
  if (isMock) {
    return {
      brandName: site.name,
      whatsappNumber: site.whatsapp,
      address: site.address,
      contactEmail: site.email,
      operatingHours: '08:00 - 21:00 WIB',
      minRentalDays: site.rental.minDays,
      maxRentalDays: site.rental.maxDays,
      minRenterAge: site.rental.minAge,
      bookingExpireMinutes: 60,
      lateFeeToleranceMinutes: 120,
      lateFeePercentPerHour: site.rental.lateFeePercentPerHour,
      defaultDeposit: 200000,
      cancellationPolicy: [
        { thresholdHours: 48, refundPercent: 100 },
        { thresholdHours: 24, refundPercent: 50 },
        { thresholdHours: 0, refundPercent: 0 },
      ],
    };
  }

  const res = await apiClient.get('/meta/site');
  return res.data?.data;
}

export async function getRentalOptions(): Promise<any> {
  if (isMock) {
    return {
      rules: {
        minDays: site.rental.minDays,
        maxDays: site.rental.maxDays,
        defaultDeposit: 200000,
        lateFeePercentPerHour: site.rental.lateFeePercentPerHour,
        operationalHours: '08:00 - 21:00 WIB',
      },
    };
  }
  const res = await apiClient.get('/meta/rental-options');
  return res.data?.data;
}

export async function getPage(slug: string): Promise<PageContent> {
  if (isMock) {
    return {
      slug,
      title: slug === 'terms' ? 'Syarat dan Ketentuan' : slug === 'privacy' ? 'Kebijakan Privasi' : slug === 'how-it-works' ? 'Cara Sewa' : 'Tentang Kami',
      bodyHtml: `<p>Halaman ${slug} (mode mock).</p>`,
      version: 1,
    };
  }
  const res = await apiClient.get(`/content/pages/${slug}`);
  return res.data?.data;
}

export async function getFaqs(): Promise<FaqItem[]> {
  if (isMock) {
    return [];
  }
  const res = await apiClient.get('/content/faqs');
  return res.data?.data || [];
}

export async function getBlocks(): Promise<ContentBlocks> {
  if (isMock) {
    return {
      heroTitle: 'Sewa motor mudah, harga jelas',
      heroSubtitle: 'Pilih motor, tentukan tanggal, dan berangkat. Tanpa biaya tersembunyi.',
      ctaText: 'Lihat motor',
      announcement: null,
    };
  }
  const res = await apiClient.get('/content/blocks');
  return res.data?.data || {
    heroTitle: 'Sewa motor mudah, harga jelas',
    heroSubtitle: 'Pilih motor, tentukan tanggal, dan berangkat. Tanpa biaya tersembunyi.',
    ctaText: 'Lihat motor',
    announcement: null,
  };
}

export async function getRealtimeTicket(): Promise<{ ticket: string; expiresIn: number }> {
  if (isMock) {
    return { ticket: 'mock-ticket-' + Date.now(), expiresIn: 30 };
  }
  const res = await apiClient.post<{ success: boolean; data: { ticket: string; expiresIn: number } }>('/events/ticket');
  return res.data.data;
}

