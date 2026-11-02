import axios from 'axios';
import {
  initialAdminBookings,
  initialAdminDocuments,
  initialAdminMotors,
  initialAdminReviews,
  initialAdminUsers,
  initialAddons,
  initialAuditLogs,
  initialLocations,
  initialMaintenanceBlocks,
  initialMessages,
  initialPromos,
  initialSystemSettings,
} from '../../../../src/admin/services/mock/adminData';

export class ApiError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

const TOKEN_KEY = 'rk_token_v1';
const CURRENT_ADMIN_KEY = 'rk_admin_session_v2';
const STORAGE_KEY = 'rk_admin_mock_store_v2';

const isMock =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_MOCK === 'true') ||
  (typeof process !== 'undefined' && process.env?.VITE_USE_MOCK === 'true');

const rawBaseURL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_URL) ||
  '/api';

const baseURL = rawBaseURL.endsWith('/') ? `${rawBaseURL}admin` : `${rawBaseURL}/admin`;

export const adminClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Interceptor Request: Sisipkan Authorization Bearer Token
adminClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Interceptor Response: Normalisasi Error, 401 -> logout, 403 -> halaman tanpa akses
adminClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    let code = 'UNKNOWN_ERROR';
    let message = error.message || 'Terjadi kesalahan pada sistem.';
    let details = null;

    if (data?.error && typeof data.error === 'object') {
      code = data.error.code || 'API_ERROR';
      message = data.error.message || message;
      details = data.error.details || null;
    } else if (data?.message) {
      message = data.message;
      code = data.code || (status === 404 ? 'NOT_FOUND' : 'API_ERROR');
      details = data.details || null;
    }

    if (status === 401 || code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED') {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(CURRENT_ADMIN_KEY);
        if (!window.location.pathname.includes('/login')) {
          const currentUrl = window.location.pathname + window.location.search;
          const redirect = encodeURIComponent(currentUrl);
          window.location.href = `/login?redirect=${redirect}`;
        }
      }
    } else if (status === 403 || code === 'FORBIDDEN' || code === 'FORBIDDEN_ROLE') {
      if (typeof window !== 'undefined') {
        if (!window.location.pathname.includes('/admin/no-access')) {
          window.location.href = '/admin/no-access';
        }
      }
    }

    return Promise.reject(new ApiError(message, code, details));
  },
);

// Fallback Mock Store
function getStoredData() {
  if (typeof window === 'undefined') {
    return {
      users: initialAdminUsers,
      motors: initialAdminMotors,
      bookings: initialAdminBookings,
      documents: initialAdminDocuments,
      maintenance: initialMaintenanceBlocks,
      reviews: initialAdminReviews,
      promos: initialPromos,
      addons: initialAddons,
      locations: initialLocations,
      messages: initialMessages,
      auditLogs: initialAuditLogs,
      settings: initialSystemSettings,
    };
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = {
      users: initialAdminUsers,
      motors: initialAdminMotors,
      bookings: initialAdminBookings,
      documents: initialAdminDocuments,
      maintenance: initialMaintenanceBlocks,
      reviews: initialAdminReviews,
      promos: initialPromos,
      addons: initialAddons,
      locations: initialLocations,
      messages: initialMessages,
      auditLogs: initialAuditLogs,
      settings: initialSystemSettings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      users: initialAdminUsers,
      motors: initialAdminMotors,
      bookings: initialAdminBookings,
      documents: initialAdminDocuments,
      maintenance: initialMaintenanceBlocks,
      reviews: initialAdminReviews,
      promos: initialPromos,
      addons: initialAddons,
      locations: initialLocations,
      messages: initialMessages,
      auditLogs: initialAuditLogs,
      settings: initialSystemSettings,
    };
  }
}

function saveStore(store) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

function delay(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordAuditMock(action, moduleName, details) {
  const store = getStoredData();
  const currentUser = adminApi.getCurrentUser();
  const newEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    actorId: currentUser?.id || 'admin-system',
    actorName: currentUser?.name || 'Administrator',
    actorRole: currentUser?.role || 'admin',
    action,
    module: moduleName,
    details,
    ipAddress: '127.0.0.1 (Local Browser)',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Test',
    timestamp: new Date().toISOString(),
  };
  store.auditLogs.unshift(newEntry);
  if (store.auditLogs.length > 200) store.auditLogs.pop();
  saveStore(store);
}

export const adminApi = {
  // ==========================================================================
  // 1. Auth & Admin Session
  // ==========================================================================
  async login(email, pass) {
    if (!isMock) {
      const authUrl = rawBaseURL.endsWith('/') ? `${rawBaseURL}auth/login` : `${rawBaseURL}/auth/login`;
      const res = await axios.post(authUrl, { email, password: pass });
      const { user, token } = res.data.data;
      if (typeof window !== 'undefined') {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(user));
      }
      return user;
    }

    await delay(300);
    const store = getStoredData();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail === 'admin@rodakita.id' && pass === 'Admin12345') {
      const u = store.users.find((x) => x.email === cleanEmail) || initialAdminUsers[0];
      localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(u));
      recordAuditMock('LOGIN', 'Otentikasi', `Login berhasil sebagai Admin (${u.name})`);
      return u;
    }
    if (cleanEmail === 'staff@rodakita.id' && pass === 'Staff12345') {
      const u = store.users.find((x) => x.email === cleanEmail) || initialAdminUsers[1];
      localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(u));
      recordAuditMock('LOGIN', 'Otentikasi', `Login berhasil sebagai Staff (${u.name})`);
      return u;
    }

    const found = store.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!found) throw new Error('Email atau kata sandi tidak valid.');
    if (!found.isActive) throw new Error('Akun Anda dinonaktifkan oleh administrator.');

    localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(found));
    recordAuditMock('LOGIN', 'Otentikasi', `Login berhasil: ${found.name} (${found.role})`);
    return found;
  },

  getCurrentUser() {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(CURRENT_ADMIN_KEY);
    if (!raw) {
      if (isMock) {
        const defaultUser = initialAdminUsers[0];
        localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(defaultUser));
        return defaultUser;
      }
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async logout() {
    if (!isMock) {
      try {
        const authUrl = rawBaseURL.endsWith('/') ? `${rawBaseURL}auth/logout` : `${rawBaseURL}/auth/logout`;
        await axios.post(authUrl);
      } catch (_) {}
    }
    const u = adminApi.getCurrentUser();
    if (u && isMock) {
      recordAuditMock('LOGOUT', 'Otentikasi', `Pengguna ${u.name} keluar dari panel`);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CURRENT_ADMIN_KEY);
    }
  },

  async switchRole(role) {
    await delay(200);
    const store = getStoredData();
    let target = store.users.find((u) => u.role === role);
    if (!target) {
      target = {
        id: `u-${role}-test`,
        name: `Tester (${role.toUpperCase()})`,
        email: `${role}@rodakita.id`,
        phone: '081234567890',
        role,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      store.users.push(target);
      saveStore(store);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(target));
    }
    return target;
  },

  // ==========================================================================
  // 2. Dashboard & Task Alerts
  // ==========================================================================
  async getDashboardStats() {
    if (!isMock) {
      const [summaryRes, revRes, tasksRes] = await Promise.all([
        adminClient.get('/dashboard/summary'),
        adminClient.get('/dashboard/revenue?days=30').catch(() => ({ data: { data: [] } })),
        adminClient.get('/dashboard/tasks').catch(() => ({ data: { data: {} } })),
      ]);

      const s = summaryRes.data.data;
      const revData = revRes.data.data || [];
      const tasksData = tasksRes.data.data || {};

      const revenue30DaysTrend = Array.isArray(revData)
        ? revData.map((d) => ({
            date: d.date || d.label,
            revenue: Number(d.revenue || d.amount || 0),
          }))
        : [];

      const todayTasks = [];
      if (tasksData.overdueReturns) {
        tasksData.overdueReturns.forEach((b) => {
          todayTasks.push({
            id: `overdue-${b.bookingId || b.id}`,
            type: 'overdue',
            title: `Unit Terlambat Kembali: ${b.motorName || 'Motor'}`,
            subtitle: `${b.renterName || 'Pelanggan'} (${b.bookingCode || '-'}) - Jadwal: ${b.scheduledReturn || '-'}`,
            link: `/admin/bookings/${b.bookingId || b.id}`,
            status: 'Terlambat',
            isUrgent: true,
          });
        });
      }
      if (tasksData.pickupsToday) {
        tasksData.pickupsToday.forEach((b) => {
          todayTasks.push({
            id: `pickup-${b.bookingId || b.id}`,
            type: 'pickup',
            title: `Serah Terima Unit: ${b.motorName || 'Motor'}`,
            subtitle: `${b.renterName || 'Pelanggan'} (${b.bookingCode || '-'}) - ${b.time || '09:00 WIB'}`,
            link: `/admin/bookings/${b.bookingId || b.id}`,
            status: 'Siap Ambil',
          });
        });
      }
      if (tasksData.returnsToday) {
        tasksData.returnsToday.forEach((b) => {
          todayTasks.push({
            id: `return-${b.bookingId || b.id}`,
            type: 'return',
            title: `Pengembalian Hari Ini: ${b.motorName || 'Motor'}`,
            subtitle: `${b.renterName || 'Pelanggan'} (${b.bookingCode || '-'}) - ${b.time || '17:00 WIB'}`,
            link: `/admin/bookings/${b.bookingId || b.id}`,
            status: 'Dijadwalkan',
          });
        });
      }

      const report = {
        pickupsTodayCount: s.todayPickups ?? 0,
        todayPickups: s.todayPickups ?? 0,
        returnsTodayCount: s.todayReturns ?? 0,
        todayReturns: s.todayReturns ?? 0,
        activeRentals: s.activeRentals ?? 0,
        activeRentalsCount: s.activeRentals ?? 0,
        pendingPaymentCount: s.pendingPayment ?? 0,
        pendingPayment: s.pendingPayment ?? 0,
        pendingDocsCount: s.pendingDocuments ?? 0,
        pendingDocumentsCount: s.pendingDocuments ?? 0,
        pendingDocuments: s.pendingDocuments ?? 0,
        overdueBookingsCount: s.overdueRentals ?? 0,
        overdueRentals: s.overdueRentals ?? 0,
        revenueThisMonth: s.monthlyRevenue ?? 0,
        revenueTotal: s.monthlyRevenue ?? 0,
        revenueGrowthPercent: s.revenueGrowthPercent ?? 0,
        occupancyRate: s.occupancyRate30Days ?? 0,
        occupancyRate30Days: s.occupancyRate30Days ?? 0,
        revenue30DaysTrend,
        todayTasks,
        bookingStatusCounts: [
          { status: 'pending', label: 'Menunggu Bayar', count: s.pendingPayment ?? 0, color: '#F59E0B' },
          { status: 'confirmed', label: 'Terkonfirmasi', count: s.todayPickups ?? 0, color: '#10B981' },
          { status: 'active', label: 'Sedang Disewa', count: s.activeRentals ?? 0, color: '#3B82F6' },
          { status: 'overdue', label: 'Terlambat', count: s.overdueRentals ?? 0, color: '#EF4444' },
        ],
        monthlyRevenue: [],
        topMotors: [],
        popularAddons: [],
      };

      return {
        data: report,
        meta: {
          pendingDocsCount: s.pendingDocuments ?? 0,
          overdueBookingsCount: s.overdueRentals ?? 0,
        },
      };
    }

    await delay(250);
    const store = getStoredData();
    const todayStr = new Date().toISOString().split('T')[0];
    const activeBookings = store.bookings.filter((b) => b.status === 'active');
    const completedBookings = store.bookings.filter((b) => b.status === 'completed');
    const pendingBookings = store.bookings.filter((b) => b.status === 'pending');
    const confirmedBookings = store.bookings.filter((b) => b.status === 'confirmed');
    const overdueBookings = activeBookings.filter((b) => b.isOverdue || b.endDate < todayStr);
    const pickupsToday = confirmedBookings.filter((b) => b.startDate <= todayStr);
    const returnsToday = activeBookings.filter((b) => b.endDate === todayStr);

    const report = {
      totalBookings: store.bookings.length,
      revenueTotal: 18500000,
      revenueThisMonth: 18500000,
      revenueGrowthPercent: 18.2,
      activeRentals: activeBookings.length,
      activeRentalsCount: activeBookings.length,
      occupancyRate: 75,
      pendingDocsCount: store.documents.filter((d) => d.status === 'pending').length,
      pendingDocumentsCount: store.documents.filter((d) => d.status === 'pending').length,
      overdueBookingsCount: overdueBookings.length,
      pickupsTodayCount: pickupsToday.length,
      returnsTodayCount: returnsToday.length,
      pendingPaymentCount: pendingBookings.length,
      revenue30DaysTrend: [],
      bookingStatusCounts: [],
      todayTasks: [],
      monthlyRevenue: [],
      topMotors: [],
      popularAddons: [],
    };

    return { data: report };
  },

  async getTaskAlerts() {
    if (!isMock) {
      const res = await adminClient.get('/dashboard/summary');
      const s = res.data.data;
      return {
        pendingDocs: s.pendingDocuments ?? 0,
        overdueBookings: s.overdueRentals ?? 0,
        unreadMessages: 0,
      };
    }
    const store = getStoredData();
    return {
      pendingDocs: store.documents.filter((d) => d.status === 'pending').length,
      overdueBookings: store.bookings.filter((b) => b.status === 'active' && b.endDate < new Date().toISOString().split('T')[0]).length,
      unreadMessages: store.messages.filter((m) => !m.isRead).length,
    };
  },

  // ==========================================================================
  // 3. Bookings
  // ==========================================================================
  async getBookings(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/bookings', { params });
      return {
        data: res.data.data,
        meta: res.data.meta,
      };
    }
    await delay(200);
    const store = getStoredData();
    let list = [...store.bookings];
    if (params.status && params.status !== 'all') {
      list = list.filter((b) => b.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (b) =>
          (b.code || '').toLowerCase().includes(q) ||
          (b.renter?.name || '').toLowerCase().includes(q) ||
          (b.motorName || '').toLowerCase().includes(q),
      );
    }
    const total = list.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const offset = (page - 1) * limit;
    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async getBookingDetail(idOrCode) {
    if (!isMock) {
      const res = await adminClient.get(`/bookings/${idOrCode}`);
      return { data: res.data.data };
    }
    await delay(150);
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === idOrCode || x.code === idOrCode);
    if (!b) throw new Error('Data booking tidak ditemukan.');
    return { data: b };
  },

  async getBookingById(idOrCode) {
    const res = await adminApi.getBookingDetail(idOrCode);
    return res.data;
  },

  async confirmPayment(bookingId, payload = {}, noteArg = '') {
    if (!isMock) {
      const body = typeof payload === 'string' ? { paymentMethod: payload, notes: noteArg } : payload;
      const res = await adminClient.post(`/bookings/${bookingId}/confirm-manual-payment`, body);
      return res.data.data.booking || res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    b.status = 'confirmed';
    b.paymentStatus = 'paid';
    b.paidAt = new Date().toISOString();
    saveStore(store);
    return b;
  },

  async handoverMotor(bookingId, payload = {}) {
    if (!isMock) {
      const body = typeof payload === 'string' ? { notes: payload } : payload;
      const res = await adminClient.post(`/bookings/${bookingId}/handover`, body);
      return res.data.data.booking || res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    b.status = 'active';
    saveStore(store);
    return b;
  },

  async returnMotor(bookingId, payload = {}) {
    if (!isMock) {
      const body = typeof payload === 'string' ? { notes: payload } : payload;
      const res = await adminClient.post(`/bookings/${bookingId}/return`, body);
      return res.data.data.booking || res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    b.status = 'completed';
    saveStore(store);
    return b;
  },

  async markDepositRefunded(bookingId) {
    if (!isMock) {
      const res = await adminClient.post(`/bookings/${bookingId}/deposit-refunded`);
      return res.data.data.booking || res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    b.depositRefundStatus = 'refunded';
    saveStore(store);
    return b;
  },

  async addBookingNote(bookingId, note) {
    if (!isMock) {
      await adminClient.post(`/bookings/${bookingId}/notes`, { note });
      const res = await adminClient.get(`/bookings/${bookingId}`);
      return res.data.data;
    }
    await delay(150);
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    if (!b.internalNotes) b.internalNotes = [];
    b.internalNotes.push({
      id: `n-${Date.now()}`,
      author: adminApi.getCurrentUser()?.name || 'Admin',
      content: note,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    return b;
  },

  async cancelBookingWithRefund(bookingId, payload = {}) {
    if (!isMock) {
      const res = await adminClient.post(`/bookings/${bookingId}/cancel`, {
        reason: payload.reason,
        refundAmount: payload.refundAmount,
        override: true,
      });
      return res.data.data.booking || res.data.data;
    }
    return adminApi.cancelBooking(bookingId, payload.reason, payload.refundAmount);
  },

  async cancelBooking(bookingId, reason = 'Pembatalan oleh admin', refundAmount = 0) {
    if (!isMock) {
      const res = await adminClient.post(`/bookings/${bookingId}/cancel`, {
        reason,
        refundAmount,
        override: true,
      });
      return res.data.data.booking || res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    b.status = 'cancelled';
    b.cancellationReason = reason;
    b.refundAmount = refundAmount;
    saveStore(store);
    return b;
  },

  // ==========================================================================
  // 4. Documents
  // ==========================================================================
  async getDocuments(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/documents', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(200);
    const store = getStoredData();
    let list = [...store.documents];
    if (params.status && params.status !== 'all') {
      list = list.filter((d) => d.status === params.status);
    }
    const total = list.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const offset = (page - 1) * limit;
    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async verifyDocument(docId, reviewerNote = '') {
    if (!isMock) {
      let userId = docId;
      let type = 'ktp';
      if (typeof docId === 'string' && docId.startsWith('doc-')) {
        const parts = docId.split('-');
        userId = parts[1];
        type = parts[2];
      } else if (typeof docId === 'string' && docId.includes('_')) {
        const parts = docId.split('_');
        userId = parts[0];
        type = parts[1];
      }
      const res = await adminClient.post(`/documents/${userId}/${type}/verify`, {
        action: 'approve',
        note: reviewerNote || 'Dokumen diverifikasi dan sah.',
      });
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const doc = store.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Dokumen tidak ditemukan.');
    doc.status = 'verified';
    doc.reviewerNote = reviewerNote;
    saveStore(store);
    return doc;
  },

  async rejectDocument(docId, reviewerNote) {
    if (!isMock) {
      let userId = docId;
      let type = 'ktp';
      if (typeof docId === 'string' && docId.startsWith('doc-')) {
        const parts = docId.split('-');
        userId = parts[1];
        type = parts[2];
      } else if (typeof docId === 'string' && docId.includes('_')) {
        const parts = docId.split('_');
        userId = parts[0];
        type = parts[1];
      }
      const res = await adminClient.post(`/documents/${userId}/${type}/verify`, {
        action: 'reject',
        rejectionReason: reviewerNote || 'Dokumen tidak memenuhi persyaratan.',
      });
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const doc = store.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Dokumen tidak ditemukan.');
    doc.status = 'rejected';
    doc.reviewerNote = reviewerNote;
    saveStore(store);
    return doc;
  },

  // ==========================================================================
  // 5. Motorcycles
  // ==========================================================================
  async getMotors(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/motorcycles', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(200);
    const store = getStoredData();
    let list = [...store.motors];
    if (params.status && params.status !== 'all') {
      list = list.filter((m) => m.status === params.status);
    }
    const total = list.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const offset = (page - 1) * limit;
    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async getMotorDetail(idOrSlug) {
    if (!isMock) {
      const res = await adminClient.get(`/motorcycles/${idOrSlug}`);
      return { data: res.data.data };
    }
    await delay(150);
    const store = getStoredData();
    const m = store.motors.find((x) => String(x.id) === String(idOrSlug) || x.slug === idOrSlug);
    if (!m) throw new Error('Motor tidak ditemukan.');
    return { data: m };
  },

  async getMotorById(idOrSlug) {
    const res = await adminApi.getMotorDetail(idOrSlug);
    return res.data;
  },

  async updateMotorStatus(id, status) {
    if (!isMock) {
      const res = await adminClient.patch(`/motorcycles/${id}/status`, { status });
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const m = store.motors.find((x) => String(x.id) === String(id));
    if (!m) throw new Error('Motor tidak ditemukan.');
    m.status = status;
    saveStore(store);
    return m;
  },

  async createMotor(motorData) {
    if (!isMock) {
      const res = await adminClient.post('/motorcycles', motorData);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const newMotor = {
      id: `m-${Date.now()}`,
      slug: (motorData.name || 'motor').toLowerCase().replace(/\s+/g, '-'),
      status: 'available',
      ...motorData,
    };
    store.motors.push(newMotor);
    saveStore(store);
    return newMotor;
  },

  async updateMotor(id, patch) {
    if (!isMock) {
      const res = await adminClient.put(`/motorcycles/${id}`, patch);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const m = store.motors.find((x) => String(x.id) === String(id));
    if (!m) throw new Error('Motor tidak ditemukan.');
    Object.assign(m, patch);
    saveStore(store);
    return m;
  },

  async deleteMotor(id) {
    if (!isMock) {
      await adminClient.delete(`/motorcycles/${id}`);
      return;
    }
    await delay(150);
    const store = getStoredData();
    store.motors = store.motors.filter((m) => String(m.id) !== String(id));
    saveStore(store);
  },

  async toggleMotorStatus(id, newStatus) {
    return adminApi.updateMotorStatus(id, newStatus);
  },

  // ==========================================================================
  // 6. Calendar & Maintenance
  // ==========================================================================
  async getCalendarData(month) {
    if (!isMock) {
      const monthStr = month || new Date().toISOString().slice(0, 7);
      const res = await adminClient.get(`/calendar?month=${monthStr}`);
      return { data: res.data.data };
    }
    await delay(200);
    const store = getStoredData();
    return {
      data: {
        motors: store.motors,
        bookings: store.bookings,
        maintenance: store.maintenance,
      },
    };
  },

  async getMaintenanceBlocks(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/maintenance', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(150);
    const store = getStoredData();
    return {
      data: store.maintenance,
      meta: { total: store.maintenance.length, page: 1, limit: 100 },
    };
  },

  async createMaintenanceBlock(blockData) {
    if (!isMock) {
      const res = await adminClient.post('/maintenance', blockData);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const block = {
      id: `maint-${Date.now()}`,
      status: 'scheduled',
      ...blockData,
    };
    store.maintenance.push(block);
    saveStore(store);
    return block;
  },

  async completeMaintenanceBlock(id, cost, notes) {
    if (!isMock) {
      const res = await adminClient.put(`/maintenance/${id}`, {
        status: 'completed',
        cost,
        notes,
      });
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const b = store.maintenance.find((m) => String(m.id) === String(id));
    if (!b) throw new Error('Jadwal servis tidak ditemukan.');
    b.status = 'completed';
    if (cost !== undefined) b.cost = cost;
    if (notes !== undefined) b.notes = notes;
    saveStore(store);
    return b;
  },

  // ==========================================================================
  // 7. Users
  // ==========================================================================
  async getUsers(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/users', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(200);
    const store = getStoredData();
    let list = [...store.users];
    if (params.role && params.role !== 'all') {
      list = list.filter((u) => u.role === params.role);
    }
    const total = list.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const offset = (page - 1) * limit;
    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async getUserDetail(id) {
    if (!isMock) {
      const res = await adminClient.get(`/users/${id}`);
      return { data: res.data.data };
    }
    await delay(150);
    const store = getStoredData();
    const u = store.users.find((x) => String(x.id) === String(id));
    if (!u) throw new Error('Pengguna tidak ditemukan.');
    return { data: u };
  },

  async getUserById(id) {
    const res = await adminApi.getUserDetail(id);
    return res.data;
  },

  async updateUserRole(id, role) {
    if (!isMock) {
      const res = await adminClient.patch(`/users/${id}/role`, { role });
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const u = store.users.find((x) => String(x.id) === String(id));
    if (!u) throw new Error('Pengguna tidak ditemukan.');
    u.role = role;
    saveStore(store);
    return u;
  },

  async createUser(userData) {
    if (!isMock) {
      const res = await adminClient.post('/users', userData);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const newUser = {
      id: `u-${Date.now()}`,
      isActive: true,
      createdAt: new Date().toISOString(),
      ...userData,
    };
    store.users.push(newUser);
    saveStore(store);
    return newUser;
  },

  async updateUser(id, patch) {
    if (!isMock) {
      const res = await adminClient.put(`/users/${id}`, patch);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const u = store.users.find((x) => String(x.id) === String(id));
    if (!u) throw new Error('Pengguna tidak ditemukan.');
    Object.assign(u, patch);
    saveStore(store);
    return u;
  },

  async toggleUserStatus(id) {
    if (!isMock) {
      const res = await adminClient.patch(`/users/${id}/status`);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const u = store.users.find((x) => String(x.id) === String(id));
    if (!u) throw new Error('Pengguna tidak ditemukan.');
    u.isActive = !u.isActive;
    saveStore(store);
    return u;
  },

  // ==========================================================================
  // 8. Reviews
  // ==========================================================================
  async getReviews(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/reviews', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(200);
    const store = getStoredData();
    let list = [...store.reviews];
    if (params.status && params.status !== 'all') {
      list = list.filter((r) => r.status === params.status);
    }
    const total = list.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const offset = (page - 1) * limit;
    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async moderateReview(id, status) {
    if (!isMock) {
      const res = await adminClient.patch(`/reviews/${id}/status`, { status });
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const r = store.reviews.find((x) => String(x.id) === String(id));
    if (!r) throw new Error('Ulasan tidak ditemukan.');
    r.status = status;
    saveStore(store);
    return r;
  },

  async deleteReview(id) {
    if (!isMock) {
      await adminClient.delete(`/reviews/${id}`);
      return;
    }
    await delay(150);
    const store = getStoredData();
    store.reviews = store.reviews.filter((r) => String(r.id) !== String(id));
    saveStore(store);
  },

  // ==========================================================================
  // 9. Promos
  // ==========================================================================
  async getPromos(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/promos', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(200);
    const store = getStoredData();
    return {
      data: store.promos,
      meta: { total: store.promos.length, page: 1, limit: 100 },
    };
  },

  async createPromo(promoData) {
    if (!isMock) {
      const res = await adminClient.post('/promos', promoData);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const p = { id: `p-${Date.now()}`, ...promoData };
    store.promos.push(p);
    saveStore(store);
    return p;
  },

  async updatePromo(id, patch) {
    if (!isMock) {
      const res = await adminClient.put(`/promos/${id}`, patch);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const p = store.promos.find((x) => String(x.id) === String(id));
    if (!p) throw new Error('Promo tidak ditemukan.');
    Object.assign(p, patch);
    saveStore(store);
    return p;
  },

  async deletePromo(id) {
    if (!isMock) {
      await adminClient.delete(`/promos/${id}`);
      return;
    }
    await delay(150);
    const store = getStoredData();
    store.promos = store.promos.filter((p) => String(p.id) !== String(id));
    saveStore(store);
  },

  // ==========================================================================
  // 10. Addons
  // ==========================================================================
  async getAddons(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/addons', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(150);
    const store = getStoredData();
    return {
      data: store.addons,
      meta: { total: store.addons.length, page: 1, limit: 100 },
    };
  },

  async createAddon(addonData) {
    if (!isMock) {
      const res = await adminClient.post('/addons', addonData);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const a = { id: `addon-${Date.now()}`, ...addonData };
    store.addons.push(a);
    saveStore(store);
    return a;
  },

  async updateAddon(id, patch) {
    if (!isMock) {
      const res = await adminClient.put(`/addons/${id}`, patch);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const a = store.addons.find((x) => String(x.id) === String(id));
    if (!a) throw new Error('Add-on tidak ditemukan.');
    Object.assign(a, patch);
    saveStore(store);
    return a;
  },

  async deleteAddon(id) {
    if (!isMock) {
      await adminClient.delete(`/addons/${id}`);
      return;
    }
    await delay(150);
    const store = getStoredData();
    store.addons = store.addons.filter((a) => String(a.id) !== String(id));
    saveStore(store);
  },

  // ==========================================================================
  // 11. Locations
  // ==========================================================================
  async getLocations(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/locations', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(150);
    const store = getStoredData();
    return {
      data: store.locations,
      meta: { total: store.locations.length, page: 1, limit: 100 },
    };
  },

  async createLocation(locationData) {
    if (!isMock) {
      const res = await adminClient.post('/locations', locationData);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const l = { id: `loc-${Date.now()}`, ...locationData };
    store.locations.push(l);
    saveStore(store);
    return l;
  },

  async updateLocation(id, patch) {
    if (!isMock) {
      const res = await adminClient.put(`/locations/${id}`, patch);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const l = store.locations.find((x) => String(x.id) === String(id));
    if (!l) throw new Error('Lokasi tidak ditemukan.');
    Object.assign(l, patch);
    saveStore(store);
    return l;
  },

  async deleteLocation(id) {
    if (!isMock) {
      await adminClient.delete(`/locations/${id}`);
      return;
    }
    await delay(150);
    const store = getStoredData();
    store.locations = store.locations.filter((l) => String(l.id) !== String(id));
    saveStore(store);
  },

  // ==========================================================================
  // 12. Settings
  // ==========================================================================
  async getSettings() {
    if (!isMock) {
      const res = await adminClient.get('/settings');
      return { data: res.data.data };
    }
    await delay(150);
    const store = getStoredData();
    return { data: store.settings };
  },

  async updateSettings(patch) {
    if (!isMock) {
      const res = await adminClient.put('/settings', patch);
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    Object.assign(store.settings, patch);
    saveStore(store);
    return store.settings;
  },

  // ==========================================================================
  // 13. Contact Messages
  // ==========================================================================
  async getMessages(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/contact-messages', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(200);
    const store = getStoredData();
    let list = [...store.messages];
    if (params.isRead !== undefined) {
      list = list.filter((m) => m.isRead === params.isRead);
    }
    const total = list.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const offset = (page - 1) * limit;
    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async markMessageRead(id) {
    if (!isMock) {
      const res = await adminClient.patch(`/contact-messages/${id}/read`);
      return res.data.data;
    }
    await delay(150);
    const store = getStoredData();
    const m = store.messages.find((x) => String(x.id) === String(id));
    if (!m) throw new Error('Pesan tidak ditemukan.');
    m.isRead = true;
    saveStore(store);
    return m;
  },

  async replyMessage(id, replyNote) {
    if (!isMock) {
      const res = await adminClient.post(`/contact-messages/${id}/reply`, { reply: replyNote });
      return res.data.data;
    }
    await delay(200);
    const store = getStoredData();
    const m = store.messages.find((x) => String(x.id) === String(id));
    if (!m) throw new Error('Pesan tidak ditemukan.');
    m.isRead = true;
    m.replyNote = replyNote;
    saveStore(store);
    return m;
  },

  // ==========================================================================
  // 14. Reports & Audit Logs
  // ==========================================================================
  async getReportData(params = {}) {
    return adminApi.getDashboardStats();
  },

  async getAuditLogs(params = {}) {
    if (!isMock) {
      const res = await adminClient.get('/audit-logs', { params });
      return { data: res.data.data, meta: res.data.meta };
    }
    await delay(200);
    const store = getStoredData();
    let list = [...store.auditLogs];
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (l) =>
          (l.action || '').toLowerCase().includes(q) ||
          (l.actorName || '').toLowerCase().includes(q) ||
          (l.details || '').toLowerCase().includes(q),
      );
    }
    const total = list.length;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const offset = (page - 1) * limit;
    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async resetStore() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CURRENT_ADMIN_KEY);
    }
  },

  recordAudit(action, moduleName, details) {
    if (isMock) {
      recordAuditMock(action, moduleName, details);
    }
  },
};

export default adminApi;
