import type { Motor } from '../../types';
import type { AdminRole } from '../permissions';
import type {
  AdminBooking,
  AdminDocument,
  AdminReview,
  AdminUser,
  AddonItem,
  ApiResponse,
  AuditLogEntry,
  ContactMessage,
  LocationItem,
  MaintenanceBlock,
  PromoItem,
  ReportSummary,
  SystemSettings,
  AdminPageItem,
  AdminPageDetail,
  AdminPageVersion,
  AdminFaqItem,
  AdminBlockItem,
  AdminPricingRule,
  AdminDiscountTier,
} from '../types';
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
} from './mock/adminData';
import { apiClient } from '../../services/api';

const isMock = import.meta.env.VITE_USE_MOCK === 'true';
const STORAGE_KEY = 'rk_admin_mock_store_v2';
const CURRENT_ADMIN_KEY = 'rk_admin_session_v2';

async function getAdminHeaders(): Promise<Record<string, string>> {
  if (typeof window !== 'undefined') {
    const existing = localStorage.getItem('rk_token_v1');
    if (existing) {
      return { Authorization: `Bearer ${existing}` };
    }
  }
  return {};
}

function mapAdminBooking(b: any): AdminBooking {
  return {
    ...b,
    id: String(b.id),
    bookingCode: b.bookingCode || b.code,
    code: b.code || b.bookingCode,
    motorName: b.motor?.name || b.motorName || 'Motor',
    motorImage: (b.motor?.images && b.motor.images[0]) || b.motorImage,
    userName: b.renter?.name || b.userName,
    userPhone: b.renter?.phone || b.userPhone,
    userEmail: b.renter?.email || b.userEmail,
    totalPrice: b.grandTotal ?? b.total ?? b.totalPrice ?? 0,
    total: b.grandTotal ?? b.total ?? b.totalPrice ?? 0,
    status: b.status,
    paymentStatus: b.paymentStatus || 'pending',
    paymentMethod: b.paymentMethod || 'transfer',
    timeline: b.timeline || [],
    handover: b.handover || null,
    returnInfo: b.returnInfo || null,
  };
}

interface AdminStore {
  users: AdminUser[];
  motors: Motor[];
  bookings: AdminBooking[];
  documents: AdminDocument[];
  maintenance: MaintenanceBlock[];
  reviews: AdminReview[];
  promos: PromoItem[];
  addons: AddonItem[];
  locations: LocationItem[];
  messages: ContactMessage[];
  auditLogs: AuditLogEntry[];
  settings: SystemSettings;
}

function getStoredData(): AdminStore {
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
    const initial: AdminStore = {
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

function saveStore(store: AdminStore): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

// Simulasi network delay 300 - 600 ms
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function checkSimulateError(): void {
  if (typeof window !== 'undefined') {
    const sim = localStorage.getItem('DEV_SIMULATE_ERRORS');
    if (sim === 'true') {
      throw new Error('DEV_SIMULATE_ERRORS aktif: Terjadi kesalahan simulasi pada server.');
    }
  }
}

function recordAudit(
  action: string,
  module: string,
  details: string,
  targetId?: string,
  targetName?: string,
): void {
  const store = getStoredData();
  const currentUser = adminApi.getCurrentUser();
  const entry: AuditLogEntry = {
    id: 'aud-' + Date.now(),
    timestamp: new Date().toISOString(),
    actorId: currentUser?.id || 'system',
    actorName: currentUser?.name || 'System Auto',
    actorRole: currentUser?.role || 'staff',
    action,
    module,
    targetId,
    targetName,
    details,
    ipAddress: '127.0.0.1',
  };
  store.auditLogs.unshift(entry);
  if (store.auditLogs.length > 200) store.auditLogs.pop();
  saveStore(store);
}

export const adminApi = {
  // ==========================================================================
  // 1. Auth & Admin Session
  // ==========================================================================
  async login(email: string, pass: string): Promise<AdminUser> {
    await delay(300);
    checkSimulateError();
    const cleanEmail = email.trim().toLowerCase();

    if (!isMock) {
      try {
        const res = await apiClient.post('/auth/login', { email: cleanEmail, password: pass });
        const { token, user } = res.data.data;
        if (user.role !== 'admin' && user.role !== 'staff') {
          throw new Error('Akses ditolak: Akun Anda bukan Administrator atau Staf.');
        }
        localStorage.setItem('rk_token_v1', token);
        localStorage.setItem('rk_session_v1', String(user.id));
        const adminUser: AdminUser = {
          id: String(user.id),
          name: user.name,
          email: user.email,
          phone: user.phone || '081234567890',
          role: user.role,
          isActive: user.isActive !== false,
          createdAt: user.createdAt || new Date().toISOString(),
        };
        localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(adminUser));
        recordAudit('LOGIN', 'Otentikasi', `Login berhasil: ${adminUser.name} (${adminUser.role})`);
        return adminUser;
      } catch (err: any) {
        if (err.message && err.message.includes('Akses ditolak')) {
          throw err;
        }
        const backendMsg = err.response?.data?.error?.message;
        if (backendMsg) {
          throw new Error(backendMsg);
        }
      }
    }

    const store = getStoredData();

    // Akun Mock khusus admin / staff
    if (cleanEmail === 'admin@rodakita.id' && pass === 'Admin12345') {
      const u = store.users.find((x) => x.email === cleanEmail) || initialAdminUsers[0];
      localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(u));
      recordAudit('LOGIN', 'Otentikasi', `Login berhasil sebagai Admin (${u.name})`);
      return u;
    }
    if (cleanEmail === 'staff@rodakita.id' && pass === 'Staff12345') {
      const u = store.users.find((x) => x.email === cleanEmail) || initialAdminUsers[1];
      localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(u));
      recordAudit('LOGIN', 'Otentikasi', `Login berhasil sebagai Staff (${u.name})`);
      return u;
    }

    // Cek di daftar pengguna
    const found = store.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!found) {
      throw new Error('Email atau kata sandi tidak valid.');
    }
    if (!found.isActive) {
      throw new Error('Akun Anda dinonaktifkan oleh administrator.');
    }

    localStorage.setItem(CURRENT_ADMIN_KEY, JSON.stringify(found));
    recordAudit('LOGIN', 'Otentikasi', `Login berhasil: ${found.name} (${found.role})`);
    return found;
  },

  getCurrentUser(): AdminUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(CURRENT_ADMIN_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await delay(100);
    const u = adminApi.getCurrentUser();
    if (u) {
      recordAudit('LOGOUT', 'Otentikasi', `Pengguna ${u.name} keluar dari panel`);
    }
    localStorage.removeItem(CURRENT_ADMIN_KEY);
    localStorage.removeItem('rk_token_v1');
    localStorage.removeItem('rk_session_v1');
  },

  // ==========================================================================
  // 2. Dashboard & Task Alerts
  // ==========================================================================
  async getDashboardStats(): Promise<ApiResponse<ReportSummary>> {
    if (!isMock) {
      try {
        const [summaryRes, tasksRes, revenueRes, bookingsRes, motorsRes] = await Promise.all([
          apiClient.get('/admin/dashboard/summary'),
          apiClient.get('/admin/dashboard/tasks'),
          apiClient.get('/admin/dashboard/revenue?days=30'),
          apiClient.get('/admin/bookings?limit=1000'),
          apiClient.get('/motors?limit=100').catch(() => ({ data: { data: [] } })),
        ]);

        const summary = summaryRes.data?.data || {};
        const tasks = tasksRes.data?.data || {};
        const revTrend = revenueRes.data?.data || [];
        const allBookings = bookingsRes.data?.data || [];
        const motorsList = motorsRes.data?.data || [];

        // Map live PostgreSQL backend data
        const pickupsTodayCount = Number(summary.todayPickups) || 0;
        const returnsTodayCount = Number(summary.todayReturns) || 0;
        const activeRentalsCount = Number(summary.activeRentals) || 0;
        const pendingPaymentCount = Number(summary.pendingPayment) || 0;
        const pendingDocsCount = Number(summary.pendingDocuments) || 0;
        const overdueBookingsCount = Number(summary.overdueRentals) || 0;
        const revenueThisMonth = Number(summary.monthlyRevenue) || 0;
        const revenueGrowthPercent = Number(summary.revenueGrowthPercent) || 0;
        const occupancyRate = Number(summary.occupancyRate30Days) || 0;

        // Map tasks
        const todayTasks: ReportSummary['todayTasks'] = [];

        (tasks.overdueReturns || []).forEach((t: any) => {
          todayTasks.push({
            id: `overdue-${t.bookingId}`,
            type: 'overdue',
            title: `Unit Terlambat Kembali: ${t.motorName || 'Motor'}`,
            subtitle: `${t.renterName || 'Pelanggan'} (${t.bookingCode}) - Jadwal: ${t.scheduledReturn}`,
            link: `/admin/bookings/${t.bookingId}`,
            status: 'Terlambat',
            isUrgent: true,
          });
        });

        (tasks.pickupsToday || []).forEach((t: any) => {
          todayTasks.push({
            id: `pickup-${t.bookingId}`,
            type: 'pickup',
            title: `Serah Terima Unit: ${t.motorName || 'Motor'}`,
            subtitle: `${t.renterName || 'Pelanggan'} (${t.bookingCode}) - ${t.time} WIB`,
            link: `/admin/bookings/${t.bookingId}`,
            status: 'Siap Ambil',
            isUrgent: false,
          });
        });

        (tasks.returnsToday || []).forEach((t: any) => {
          todayTasks.push({
            id: `return-${t.bookingId}`,
            type: 'return',
            title: `Pemeriksaan Kembali: ${t.motorName || 'Motor'}`,
            subtitle: `${t.renterName || 'Pelanggan'} (${t.bookingCode}) - ${t.time} WIB`,
            link: `/admin/bookings/${t.bookingId}`,
            status: 'Jadwal Kembali',
            isUrgent: false,
          });
        });

        (tasks.pendingDocs || []).forEach((t: any) => {
          todayTasks.push({
            id: `doc-${t.userId}-${t.type}`,
            type: 'document',
            title: `Verifikasi Dokumen: ${String(t.type).toUpperCase()}`,
            subtitle: `${t.userName || 'Penyewa'}`,
            link: `/admin/documents?search=${encodeURIComponent(t.userName || '')}`,
            status: 'Menunggu Review',
            isUrgent: false,
          });
        });

        // 30 Days Trend Data
        const revenue30DaysTrend = (revTrend || []).map((r: any) => {
          const d = new Date(r.date);
          const dayLabel = `${d.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()]}`;
          return {
            date: dayLabel,
            revenue: Number(r.revenue) || 0,
          };
        });

        // Status counts for Bar Chart
        const bookingStatusCounts = [
          { status: 'pending', label: 'Menunggu Bayar', count: allBookings.filter((b: any) => b.status === 'pending').length, color: '#F59E0B' },
          { status: 'confirmed', label: 'Terkonfirmasi', count: allBookings.filter((b: any) => b.status === 'confirmed').length, color: '#10B981' },
          { status: 'active', label: 'Sedang Disewa', count: allBookings.filter((b: any) => b.status === 'active').length, color: '#3B82F6' },
          { status: 'completed', label: 'Selesai', count: allBookings.filter((b: any) => b.status === 'completed').length, color: '#6B7280' },
          { status: 'overdue', label: 'Terlambat', count: overdueBookingsCount, color: '#EF4444' },
          { status: 'cancelled', label: 'Dibatalkan', count: allBookings.filter((b: any) => b.status === 'cancelled').length, color: '#DC2626' },
        ];

        return {
          data: {
            revenueTotal: revenueThisMonth,
            totalRevenue: revenueThisMonth,
            revenueThisMonth,
            revenueGrowthPercent,
            bookingsTotal: allBookings.length,
            bookingsThisMonth: allBookings.length,
            activeRentalsCount,
            activeRentals: activeRentalsCount,
            occupancyRate,
            pendingDocsCount,
            pendingDocumentsCount: pendingDocsCount,
            overdueBookingsCount,
            pickupsTodayCount,
            returnsTodayCount,
            pendingPaymentCount,
            totalMotors: motorsList.length || 12,
            availableMotors: motorsList.filter((m: any) => m.available || m.status === 'available').length,
            rentedMotors: activeRentalsCount,
            maintenanceMotors: motorsList.filter((m: any) => m.status === 'maintenance').length,
            monthlyRevenue: [{ month: 'Bulan Ini', revenue: revenueThisMonth, bookings: allBookings.length }],
            revenue30DaysTrend,
            bookingStatusCounts,
            todayTasks,
          },
          meta: {
            pendingDocsCount,
            overdueBookingsCount,
            unreadMessagesCount: 0,
          },
        };
      } catch (err: any) {
        console.warn('[AdminApi] getDashboardStats live fetch failed, fallback to store:', err);
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();

    const todayStr = new Date().toISOString().split('T')[0];
    const activeBookings = store.bookings.filter((b) => b.status === 'active');
    const completedBookings = store.bookings.filter((b) => b.status === 'completed');
    const pendingBookings = store.bookings.filter((b) => b.status === 'pending');
    const confirmedBookings = store.bookings.filter((b) => b.status === 'confirmed');

    // Pengambilan hari ini (confirmed booking dengan tanggal mulai hari ini atau terlewat)
    const pickupsToday = confirmedBookings.filter((b) => b.startDate <= todayStr);

    // Pengembalian hari ini (active booking dengan tanggal selesai hari ini)
    const returnsToday = activeBookings.filter((b) => b.endDate === todayStr && !b.isOverdue);

    // Booking terlambat kembali (active dan end_date sudah lewat)
    const overdueBookings = activeBookings.filter((b) => b.isOverdue || b.endDate < todayStr);

    // Dokumen pending
    const pendingDocsList = store.documents.filter((d) => d.status === 'pending');
    const pendingDocs = pendingDocsList.length;

    // Hitung total pendapatan sesuai rumus resmi
    const revenueTotal = store.bookings
      .filter((b) => ['confirmed', 'active', 'completed'].includes(b.status))
      .reduce((sum, b) => {
        const rental = b.total ?? b.totalPrice ?? 0;
        const refund = b.refundAmount ?? 0;
        const extra = (b.lateFee ?? 0) + (b.damageFee ?? 0) + (b.otherFee ?? 0);
        return sum + Math.max(0, rental - refund + extra);
      }, 0);

    const totalMotors = store.motors.length || 1;
    const occupancyRate = Math.min(100, Math.round((activeBookings.length / totalMotors) * 100));

    // 30 Days Trend Data for Line Chart
    const revenue30DaysTrend: { date: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const dayLabel = `${d.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()]}`;

      // Hitung pendapatan pada tanggal tersebut atau estimasi baseline harian
      const dayRev = store.bookings
        .filter((b) => b.paidAt && b.paidAt.startsWith(dateKey))
        .reduce((s, b) => s + (b.total ?? b.totalPrice ?? 0), 0);

      // Baseline organik jika mock data terbatas
      const baseline = (Math.sin(i * 0.4) * 0.25 + 0.75) * 850000;
      revenue30DaysTrend.push({
        date: dayLabel,
        revenue: dayRev > 0 ? dayRev : Math.round(baseline / 10000) * 10000,
      });
    }

    // Status counts for Bar Chart
    const bookingStatusCounts = [
      { status: 'pending', label: 'Menunggu Bayar', count: pendingBookings.length, color: '#F59E0B' },
      { status: 'confirmed', label: 'Terkonfirmasi', count: confirmedBookings.length, color: '#10B981' },
      { status: 'active', label: 'Sedang Disewa', count: activeBookings.length, color: '#3B82F6' },
      { status: 'completed', label: 'Selesai', count: completedBookings.length, color: '#6B7280' },
      { status: 'overdue', label: 'Terlambat', count: overdueBookings.length, color: '#EF4444' },
      { status: 'cancelled', label: 'Dibatalkan', count: store.bookings.filter((b) => b.status === 'cancelled').length, color: '#DC2626' },
    ];

    // Daftar "Tugas Hari Ini" dengan tautan langsung ke detail
    const todayTasks: ReportSummary['todayTasks'] = [];

    // 1. Booking terlambat
    overdueBookings.forEach((b) => {
      todayTasks.push({
        id: `overdue-${b.id}`,
        type: 'overdue',
        title: `Unit Terlambat Kembali: ${b.motorName || 'Motor'}`,
        subtitle: `${b.renter?.name || b.userName} (${b.code || b.bookingCode}) - Jadwal: ${b.endDate}`,
        link: `/admin/bookings/${b.id}`,
        status: 'Terlambat',
        isUrgent: true,
      });
    });

    // 2. Pengambilan hari ini
    pickupsToday.forEach((b) => {
      todayTasks.push({
        id: `pickup-${b.id}`,
        type: 'pickup',
        title: `Serah Terima Unit: ${b.motorName || 'Motor'}`,
        subtitle: `${b.renter?.name || b.userName} (${b.code || b.bookingCode}) - ${b.pickupTime || '09:00 WIB'}`,
        link: `/admin/bookings/${b.id}`,
        status: 'Siap Ambil',
      });
    });

    // 3. Pengembalian hari ini
    returnsToday.forEach((b) => {
      todayTasks.push({
        id: `return-${b.id}`,
        type: 'return',
        title: `Pengembalian Motor: ${b.motorName || 'Motor'}`,
        subtitle: `${b.renter?.name || b.userName} (${b.code || b.bookingCode})`,
        link: `/admin/bookings/${b.id}`,
        status: 'Jadwal Hari Ini',
      });
    });

    // 4. Dokumen perlu diverifikasi
    pendingDocsList.slice(0, 5).forEach((d) => {
      todayTasks.push({
        id: `doc-${d.id}`,
        type: 'document',
        title: `Verifikasi Dokumen: ${d.type.toUpperCase()}`,
        subtitle: `${d.userName} (${d.userEmail})`,
        link: `/admin/documents`,
        status: 'Menunggu Review',
      });
    });

    const report: ReportSummary = {
      revenueTotal,
      totalRevenue: revenueTotal,
      revenueThisMonth: Math.round(revenueTotal * 0.52),
      revenueLastMonth: Math.round(revenueTotal * 0.44),
      revenueGrowthPercent: 18.2,
      bookingsTotal: store.bookings.length,
      bookingsThisMonth: store.bookings.filter((b) => b.createdAt.startsWith('2026-10')).length,
      activeRentalsCount: activeBookings.length,
      activeRentals: activeBookings.length,
      totalMotors,
      availableMotors: store.motors.filter((m) => m.status === 'available').length,
      rentedMotors: activeBookings.length,
      maintenanceMotors: store.motors.filter((m) => m.status === 'maintenance').length,
      occupancyRate,
      pendingDocsCount: pendingDocs,
      pendingDocumentsCount: pendingDocs,
      overdueBookingsCount: overdueBookings.length,
      pickupsTodayCount: pickupsToday.length,
      returnsTodayCount: returnsToday.length,
      pendingPaymentCount: pendingBookings.length,
      revenue30DaysTrend,
      bookingStatusCounts,
      todayTasks,
      monthlyRevenue: [
        { month: 'Mei', revenue: 8400000, bookings: 18 },
        { month: 'Jun', revenue: 11200000, bookings: 24 },
        { month: 'Jul', revenue: 15600000, bookings: 32 },
        { month: 'Agt', revenue: 18900000, bookings: 38 },
        { month: 'Sep', revenue: 16500000, bookings: 35 },
        { month: 'Okt', revenue: revenueTotal, bookings: store.bookings.length },
      ],
      statusDistribution: [
        { status: 'active', label: 'Sedang Berjalan', count: activeBookings.length, color: '#1F5099' },
        { status: 'confirmed', label: 'Terkonfirmasi', count: confirmedBookings.length, color: '#16A34A' },
        { status: 'pending', label: 'Menunggu Bayar', count: pendingBookings.length, color: '#D97706' },
        { status: 'completed', label: 'Selesai', count: completedBookings.length, color: '#64748B' },
        { status: 'cancelled', label: 'Dibatalkan', count: store.bookings.filter((b) => b.status === 'cancelled').length, color: '#DC2626' },
      ],
      topMotors: store.motors.slice(0, 5).map((m, idx) => ({
        id: m.id,
        name: m.name,
        brand: m.brand,
        rentalCount: 14 - idx * 2,
        revenue: (14 - idx * 2) * m.pricePerDay * 3,
      })),
      popularAddons: store.addons.map((a, idx) => ({
        id: a.id,
        name: a.name,
        count: 25 - idx * 5,
        revenue: (25 - idx * 5) * a.pricePerDay,
      })),
    };

    return {
      data: report,
      meta: {
        pendingDocsCount: pendingDocs,
        overdueBookingsCount: overdueBookings.length,
        unreadMessagesCount: store.messages.filter((m) => !m.isRead).length,
      },
    };
  },

  async getTaskAlerts(): Promise<{ pendingDocs: number; overdueBookings: number; unreadMessages: number }> {
    if (!isMock) {
      try {
        const [summaryRes, msgRes] = await Promise.all([
          apiClient.get('/admin/dashboard/summary'),
          apiClient.get('/admin/messages?unread=true').catch(() => ({ data: { meta: { unreadCount: 0 } } })),
        ]);
        const sum = summaryRes.data?.data || {};
        return {
          pendingDocs: Number(sum.pendingDocuments) || 0,
          overdueBookings: Number(sum.overdueRentals) || 0,
          unreadMessages: Number(msgRes.data?.meta?.unreadCount) || 0,
        };
      } catch (err: any) {
        console.warn('[AdminApi] getTaskAlerts live fetch failed, fallback to store:', err);
      }
    }
    const store = getStoredData();
    return {
      pendingDocs: store.documents.filter((d) => d.status === 'pending').length,
      overdueBookings: store.bookings.filter((b) => b.status === 'active' && b.isOverdue).length,
      unreadMessages: store.messages.filter((m) => !m.isRead).length,
    };
  },

  // ==========================================================================
  // 3. Bookings
  // ==========================================================================
  async getBookings(params: {
    status?: string;
    search?: string;
    motorId?: string;
    startDate?: string;
    endDate?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    sort?: string;
  } = {}): Promise<ApiResponse<AdminBooking[]>> {
    if (!isMock) {
      try {
        const headers = await getAdminHeaders();
        const res = await apiClient.get('/admin/bookings', { params, headers });
        if (res.data && res.data.data) {
          const mapped: AdminBooking[] = res.data.data.map((b: any) => ({
            ...b,
            id: String(b.id),
            bookingCode: b.bookingCode || b.code,
            code: b.code || b.bookingCode,
            motorId: String(b.motorId || b.motorcycleId || b.motor?.id || ''),
            motorPlate: b.motorPlate || b.motor?.plate || b.motor?.licensePlate || '-',
            motorName: b.motor?.name || b.motorName || 'Motor',
            motorImage: (b.motor?.images && b.motor.images[0]) || b.motorImage,
            userName: b.renter?.name || b.userName,
            userPhone: b.renter?.phone || b.userPhone,
            userEmail: b.renter?.email || b.userEmail,
            totalPrice: b.grandTotal ?? b.total ?? 0,
            status: b.status,
            timeline: b.timeline || [],
            startOdometer: b.startOdometer ?? b.handover?.startOdometer ?? b.handover?.odometerStart,
            endOdometer: b.endOdometer ?? b.returnInfo?.endOdometer ?? b.returnInfo?.odometerEnd,
            startFuelLevel: b.startFuelLevel ?? b.handover?.startFuelLevel ?? b.handover?.fuelStart,
            endFuelLevel: b.endFuelLevel ?? b.returnInfo?.endFuelLevel ?? b.returnInfo?.fuelEnd,
          }));
          return {
            data: mapped,
            meta: {
              total: res.data.meta?.total ?? mapped.length,
              page: res.data.meta?.page ?? params.page ?? 1,
              limit: res.data.meta?.limit ?? params.limit ?? 10,
              totalPages: Math.max(1, Math.ceil((res.data.meta?.total ?? mapped.length) / (params.limit || 10))),
              statusCounts: res.data.meta?.statusCounts,
            },
          };
        }
      } catch (err) {
        console.warn('[AdminApi] getBookings live fetch failed, fallback to store:', err);
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.bookings];

    if (params.status && params.status !== 'all') {
      list = list.filter((b) => b.status === params.status);
    }

    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (b) =>
          b.code.toLowerCase().includes(q) ||
          b.renter.name.toLowerCase().includes(q) ||
          b.renter.phone.includes(q) ||
          b.renter.email.toLowerCase().includes(q),
      );
    }

    if (params.motorId && params.motorId !== 'all') {
      list = list.filter((b) => b.motorId === params.motorId);
    }

    const dFrom = params.startDate || params.dateFrom;
    if (dFrom) {
      list = list.filter((b) => b.startDate >= dFrom);
    }
    const dTo = params.endDate || params.dateTo;
    if (dTo) {
      list = list.filter((b) => b.endDate <= dTo);
    }

    // Sort default: newest created first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const paginated = list.slice(offset, offset + limit);

    const statusCounts = {
      all: store.bookings.length,
      pending: store.bookings.filter((b) => b.status === 'pending').length,
      confirmed: store.bookings.filter((b) => b.status === 'confirmed').length,
      active: store.bookings.filter((b) => b.status === 'active').length,
      completed: store.bookings.filter((b) => b.status === 'completed').length,
      cancelled: store.bookings.filter((b) => b.status === 'cancelled').length,
    };

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages,
        statusCounts,
      },
    };
  },

  async getBookingDetail(idOrCode: string): Promise<ApiResponse<AdminBooking>> {
    if (!isMock) {
      const headers = await getAdminHeaders();
      const res = await apiClient.get(`/admin/bookings/${idOrCode}`, { headers });
      if (res.data && res.data.data) {
        return { data: mapAdminBooking(res.data.data) };
      }
      throw new Error('Data pemesanan tidak ditemukan.');
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const clean = idOrCode.trim().toLowerCase();
    const found = store.bookings.find(
      (b) => b.id.toLowerCase() === clean || b.code.toLowerCase() === clean,
    );
    if (!found) {
      throw new Error('Data pemesanan tidak ditemukan.');
    }
    return { data: found };
  },

  async getBookingById(idOrCode: string): Promise<AdminBooking> {
    const res = await this.getBookingDetail(idOrCode);
    return res.data;
  },

  async confirmPayment(
    bookingId: string,
    payload?: { method?: 'cash' | 'transfer' | 'ewallet'; amount?: number; note?: string } | 'cash' | 'transfer' | 'ewallet' | string,
    noteArg?: string,
  ): Promise<AdminBooking> {
    let method: 'cash' | 'transfer' | 'ewallet' = 'transfer';
    let amount: number | undefined = undefined;
    let note: string | undefined = noteArg;

    if (typeof payload === 'object' && payload !== null) {
      method = payload.method === ('qris' as any) ? 'ewallet' : (payload.method || 'transfer');
      amount = payload.amount;
      note = payload.note;
    } else if (typeof payload === 'string') {
      if (payload === 'cash' || payload === 'transfer' || payload === 'ewallet') {
        method = payload;
      } else if (payload === ('qris' as any)) {
        method = 'ewallet';
      } else {
        note = payload;
      }
    }

    if (!isMock) {
      const headers = await getAdminHeaders();
      const res = await apiClient.post(
        `/admin/bookings/${bookingId}/confirm-manual-payment`,
        { paymentMethod: method, amount, notes: note },
        { headers }
      );
      if (res.data && res.data.data) {
        return mapAdminBooking(res.data.data);
      }
    }

    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId || x.code === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    if (b.status !== 'pending') {
      throw new Error(`Konfirmasi pembayaran hanya dapat dilakukan untuk booking berstatus "pending". Status saat ini: "${b.status}".`);
    }

    b.status = 'confirmed';
    b.paymentStatus = 'paid';
    b.paymentMethod = method;
    b.paidAt = new Date().toISOString();
    b.timeline.push({
      status: 'confirmed',
      title: `Pembayaran Dikonfirmasi Manual (${method.toUpperCase()})`,
      note: note || `Pembayaran lunas dikonfirmasi via ${method.toUpperCase()} oleh staf admin.`,
      actor: adminApi.getCurrentUser()?.name || 'Staff',
      timestamp: new Date().toISOString(),
    });

    saveStore(store);
    recordAudit('CONFIRM_PAYMENT', 'Booking', `Konfirmasi pembayaran booking #${b.code} via ${method.toUpperCase()}`, b.id, b.code);
    return b;
  },

  async handoverMotor(
    bookingId: string,
    payload?: {
      startOdometer: number;
      initialFuel: string;
      conditionNotes?: string;
      originalDocsChecked: boolean;
      depositReceived: boolean;
      photos?: string[];
    } | string,
  ): Promise<AdminBooking> {
    if (!isMock) {
      const headers = await getAdminHeaders();
      const body = typeof payload === 'object' && payload !== null ? {
        startOdometer: payload.startOdometer,
        initialFuel: payload.initialFuel,
        conditionNotes: payload.conditionNotes,
        originalDocsChecked: payload.originalDocsChecked,
        depositReceived: payload.depositReceived,
        photos: payload.photos || [],
      } : {
        startOdometer: 10000,
        initialFuel: 'penuh',
        conditionNotes: payload || 'Unit diserahterimakan',
        originalDocsChecked: true,
        depositReceived: true,
        photos: [],
      };
      const res = await apiClient.post(
        `/admin/bookings/${bookingId}/handover`,
        body,
        { headers }
      );
      if (res.data && res.data.data) {
        return mapAdminBooking(res.data.data.booking || res.data.data);
      }
    }

    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId || x.code === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');

    if (b.status !== 'confirmed') {
      const err: any = new Error(`Serah terima hanya dapat dilakukan untuk booking dengan status "confirmed". Status saat ini: "${b.status}".`);
      err.code = 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    if (b.paymentStatus !== 'paid') {
      const err: any = new Error('Pembayaran sewa belum lunas! Mohon konfirmasi pembayaran terlebih dahulu.');
      err.code = 'PAYMENT_NOT_PAID';
      throw err;
    }

    // Pengecekan verifikasi dokumen pelanggan
    const userDocs = store.documents.filter(
      (d) => d.userId === b.userId || (b.renter?.email && d.userEmail.toLowerCase() === b.renter.email.toLowerCase())
    );
    if (userDocs.length > 0) {
      const ktp = userDocs.find((d) => d.type === 'ktp');
      const sim = userDocs.find((d) => d.type === 'sim');
      if (ktp?.status !== 'verified' || sim?.status !== 'verified') {
        const err: any = new Error('Dokumen identitas penyewa (KTP / SIM C) belum lengkap dan terverifikasi!');
        err.code = 'DOCS_NOT_VERIFIED';
        throw err;
      }
    }

    let noteStr = '';
    if (typeof payload === 'object') {
      if (!payload.originalDocsChecked) {
        throw new Error('Pemeriksaan fisik dokumen asli KTP/SIM wajib dicentang sebelum serah terima.');
      }
      if (!payload.depositReceived) {
        throw new Error('Penerimaan uang deposit jaminan wajib dicentang sebelum serah terima.');
      }
      b.startOdometer = payload.startOdometer;
      b.initialFuel = payload.initialFuel;
      b.handover = {
        startOdometer: payload.startOdometer,
        initialFuel: payload.initialFuel,
        conditionNotes: payload.conditionNotes,
        originalDocsChecked: payload.originalDocsChecked,
        depositReceived: payload.depositReceived,
        at: new Date().toISOString(),
        by: adminApi.getCurrentUser()?.name || 'Staff',
        photos: payload.photos || [],
      };
      noteStr = `Odo: ${payload.startOdometer} km | BBM: ${payload.initialFuel} | Kondisi: ${payload.conditionNotes || 'Baik'} | KTP/SIM Asli: Ya | Deposit: Diterima`;
    } else {
      noteStr = payload || 'Unit motor telah diserahkan kepada penyewa.';
    }

    b.status = 'active';
    b.timeline.push({
      status: 'active',
      title: 'Unit Diserah-terimakan (Kunci Diserahkan)',
      note: noteStr,
      actor: adminApi.getCurrentUser()?.name || 'Staff',
      timestamp: new Date().toISOString(),
    });

    saveStore(store);
    recordAudit('HANDOVER_UNIT', 'Booking', `Serah terima unit booking #${b.code}: ${noteStr}`, b.id, b.code);
    return b;
  },

  calculateReturnSummary(
    booking: AdminBooking,
    actualReturnTimeStr: string,
    damageFee: number = 0,
    otherFee: number = 0,
  ) {
    const store = getStoredData();
    const tolerance = store.settings.lateFeeToleranceMinutes ?? 120;
    const latePercent = store.settings.lateFeePercentPerHour ?? 10;

    const pickupTime = booking.pickupTime || '09:00';
    const scheduled = new Date(`${booking.endDate}T${pickupTime}:00+07:00`);
    const actual = new Date(actualReturnTimeStr);

    let diffMinutes = Math.floor((actual.getTime() - scheduled.getTime()) / (1000 * 60));
    let lateHours = 0;
    let lateFee = 0;
    let isOverdue = false;

    const motor = store.motors.find((m) => m.id === booking.motorId);
    const dailyPrice = motor?.pricePerDay || 100000;
    const hourlyFee = Math.round(dailyPrice * (latePercent / 100));

    if (diffMinutes > tolerance) {
      isOverdue = true;
      lateHours = Math.ceil(diffMinutes / 60);
      const fullDays = Math.floor(lateHours / 24);
      const remHours = lateHours % 24;
      lateFee = Math.round(fullDays * dailyPrice + Math.min(dailyPrice, remHours * hourlyFee));
    }

    const deposit = booking.deposit || 200000;
    const totalDeduction = lateFee + damageFee + otherFee;
    const refundDeposit = Math.max(0, deposit - totalDeduction);
    const underpayment = Math.max(0, totalDeduction - deposit);

    return {
      scheduledReturnTime: scheduled.toISOString(),
      actualReturnTime: actual.toISOString(),
      diffMinutes,
      lateHours,
      hourlyLateFee: hourlyFee,
      lateFee,
      damageFee,
      otherFee,
      isOverdue,
      deposit,
      totalDeduction,
      refundDeposit,
      underpayment,
    };
  },

  async returnMotor(
    bookingId: string,
    payload?: {
      returnTime?: string;
      endOdometer: number;
      finalFuel: string;
      notes?: string;
      damageFee?: number;
      otherFee?: number;
    } | string,
  ): Promise<AdminBooking> {
    if (!isMock) {
      const headers = await getAdminHeaders();
      const body = typeof payload === 'object' && payload !== null ? {
        returnTime: payload.returnTime || new Date().toISOString(),
        endOdometer: payload.endOdometer,
        finalFuel: payload.finalFuel,
        notes: payload.notes,
        damageFee: payload.damageFee || 0,
        otherFee: payload.otherFee || 0,
      } : {
        returnTime: new Date().toISOString(),
        notes: payload,
        damageFee: 0,
        otherFee: 0,
      };
      const res = await apiClient.post(
        `/admin/bookings/${bookingId}/return`,
        body,
        { headers }
      );
      if (res.data && res.data.data) {
        return mapAdminBooking(res.data.data.booking || res.data.data);
      }
    }

    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId || x.code === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');

    if (b.status !== 'active') {
      throw new Error(`Pengembalian hanya dapat dilakukan untuk booking dengan status "active". Status saat ini: "${b.status}".`);
    }

    const returnTime = typeof payload === 'object' && payload.returnTime ? payload.returnTime : new Date().toISOString();
    let noteStr = '';

    if (typeof payload === 'object') {
      if (b.startOdometer && payload.endOdometer < b.startOdometer) {
        const err: any = new Error(`Odometer akhir (${payload.endOdometer} km) tidak boleh lebih kecil dari odometer awal (${b.startOdometer} km).`);
        err.code = 'ODOMETER_INVALID';
        throw err;
      }

      const calc = this.calculateReturnSummary(b, returnTime, payload.damageFee || 0, payload.otherFee || 0);
      b.endOdometer = payload.endOdometer;
      b.finalFuel = payload.finalFuel;
      b.lateFee = calc.lateFee;
      b.damageFee = payload.damageFee || 0;
      b.otherFee = payload.otherFee || 0;
      b.refundDeposit = calc.refundDeposit;
      b.underpayment = calc.underpayment;
      b.isOverdue = false;
      b.actualReturnDate = returnTime;

      b.returnInfo = {
        endOdometer: payload.endOdometer,
        finalFuel: payload.finalFuel,
        notes: payload.notes,
        returnTime,
        lateFee: calc.lateFee,
        damageFee: payload.damageFee || 0,
        otherFee: payload.otherFee || 0,
        totalDeduction: calc.totalDeduction,
        refundDeposit: calc.refundDeposit,
        underpayment: calc.underpayment,
        at: new Date().toISOString(),
        by: adminApi.getCurrentUser()?.name || 'Staff',
      };

      noteStr = `Odo akhir: ${payload.endOdometer} km | BBM: ${payload.finalFuel} | Denda: Rp ${calc.lateFee.toLocaleString('id-ID')} | Kerusakan: Rp ${(payload.damageFee || 0).toLocaleString('id-ID')} | Deposit kembali: Rp ${calc.refundDeposit.toLocaleString('id-ID')}${calc.underpayment > 0 ? ` (Kurang Bayar: Rp ${calc.underpayment.toLocaleString('id-ID')})` : ''}`;
    } else {
      b.actualReturnDate = returnTime;
      b.isOverdue = false;
      noteStr = payload || 'Unit diterima kembali dan sewa selesai.';
    }

    b.status = 'completed';
    b.timeline.push({
      status: 'completed',
      title: 'Motor Dikembalikan & Selesai',
      note: noteStr,
      actor: adminApi.getCurrentUser()?.name || 'Staff',
      timestamp: new Date().toISOString(),
    });

    // Kembalikan status motor ke available
    const motor = store.motors.find((m) => m.id === b.motorId);
    if (motor) {
      motor.status = 'available';
    }

    saveStore(store);
    recordAudit('RETURN_UNIT', 'Booking', `Pengembalian unit booking #${b.code}: ${noteStr}`, b.id, b.code);
    return b;
  },

  async markDepositRefunded(bookingId: string): Promise<AdminBooking> {
    if (!isMock) {
      const headers = await getAdminHeaders();
      const res = await apiClient.post(
        `/admin/bookings/${bookingId}/deposit-refunded`,
        {},
        { headers }
      );
      if (res.data && res.data.data) {
        return mapAdminBooking(res.data.data);
      }
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId || x.code === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');
    if (b.status !== 'completed') throw new Error('Deposit hanya dapat dikembalikan setelah motor selesai disewa.');
    if (b.depositReturned) throw new Error('Deposit untuk transaksi ini sudah ditandai dikembalikan sebelumnya.');

    b.depositReturned = true;
    b.depositRefundedAt = new Date().toISOString();
    b.timeline.push({
      status: 'completed',
      title: 'Deposit Dikembalikan ke Pelanggan',
      note: `Pengembalian dana deposit jaminan sebesar Rp ${(b.refundDeposit ?? b.deposit ?? 0).toLocaleString('id-ID')} telah diserahkan kepada penyewa.`,
      actor: adminApi.getCurrentUser()?.name || 'Staff',
      timestamp: new Date().toISOString(),
    });

    saveStore(store);
    recordAudit('REFUND_DEPOSIT', 'Booking', `Tandai deposit dikembalikan untuk #${b.code}`, b.id, b.code);
    return b;
  },

  async addBookingNote(bookingId: string, note: string): Promise<AdminBooking> {
    if (!isMock) {
      const headers = await getAdminHeaders();
      await apiClient.post(
        `/admin/bookings/${bookingId}/notes`,
        { note },
        { headers }
      );
      const res = await this.getBookingDetail(bookingId);
      return res.data;
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId || x.code === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');

    b.notes = (b.notes ? b.notes + '\n' : '') + `[${new Date().toLocaleDateString('id-ID')}]: ${note}`;
    b.timeline.push({
      status: b.status,
      title: 'Catatan Ditambahkan',
      note,
      actor: adminApi.getCurrentUser()?.name || 'Staff',
      timestamp: new Date().toISOString(),
    });

    saveStore(store);
    recordAudit('ADD_NOTE', 'Booking', `Tambah catatan pada booking #${b.code}`, b.id, b.code);
    return b;
  },

  async cancelBookingWithRefund(
    bookingId: string,
    payload: { reason: string; refundAmount: number },
  ): Promise<AdminBooking> {
    if (!isMock) {
      const headers = await getAdminHeaders();
      const res = await apiClient.post(
        `/admin/bookings/${bookingId}/cancel`,
        { reason: payload.reason, refundAmount: payload.refundAmount },
        { headers }
      );
      if (res.data && res.data.data) {
        return mapAdminBooking(res.data.data);
      }
    }

    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const b = store.bookings.find((x) => x.id === bookingId || x.code === bookingId);
    if (!b) throw new Error('Booking tidak ditemukan.');

    b.status = 'cancelled';
    b.paymentStatus = 'refunded';
    b.cancelledAt = new Date().toISOString();
    b.cancelReason = payload.reason;
    b.refundAmount = payload.refundAmount;

    b.timeline.push({
      status: 'cancelled',
      title: 'Booking Dibatalkan & Refund Diproses',
      note: `Alasan: ${payload.reason}. Pengembalian dana Rp ${payload.refundAmount.toLocaleString('id-ID')}`,
      actor: adminApi.getCurrentUser()?.name || 'Admin',
      timestamp: new Date().toISOString(),
    });

    saveStore(store);
    recordAudit(
      'CANCEL_REFUND',
      'Booking',
      `Batalkan booking #${b.code} dengan refund Rp ${payload.refundAmount.toLocaleString('id-ID')}`,
      b.id,
      b.code,
    );
    return b;
  },

  async cancelBooking(bookingId: string, reason?: string, refundAmount?: number): Promise<AdminBooking> {
    return this.cancelBookingWithRefund(bookingId, {
      reason: reason || 'Dibatalkan oleh staf admin.',
      refundAmount: refundAmount || 0,
    });
  },

  // ==========================================================================
  // 4. Documents
  // ==========================================================================
  async getDocuments(params: {
    status?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<AdminDocument[]>> {
    if (!isMock) {
      try {
        const queryParams = new URLSearchParams();
        if (params.status && params.status !== 'all') queryParams.append('status', params.status);
        if (params.type && params.type !== 'all') queryParams.append('type', params.type);
        if (params.search) queryParams.append('search', params.search);
        if (params.page) queryParams.append('page', String(params.page));
        if (params.limit) queryParams.append('limit', String(params.limit));
        const res = await apiClient.get(`/admin/documents?${queryParams.toString()}`);
        const token =
          localStorage.getItem('rk_token_v1') ||
          localStorage.getItem('rodakita_admin_token') ||
          localStorage.getItem('token') ||
          '';
        const rawItems = res.data?.data || [];
        const mappedList: AdminDocument[] = (Array.isArray(rawItems) ? rawItems : []).map((d: any) => {
          let fileUrl = d.fileUrl || `/api/admin/documents/${d.userId}/${d.type}/file`;
          if (token && !fileUrl.includes('token=')) {
            const sep = fileUrl.includes('?') ? '&' : '?';
            fileUrl = `${fileUrl}${sep}token=${encodeURIComponent(token)}`;
          }
          return {
            ...d,
            id: d.id || `doc-${d.userId}-${d.type}`,
            idNumber: d.idNumber || d.id_number || (d.type === 'ktp' ? '3201************' : 'SIM-C-********'),
            fileUrl,
            filePath: d.filePath,
          };
        });
        const total = res.data?.meta?.total ?? mappedList.length;
        const page = res.data?.meta?.page ?? params.page ?? 1;
        const limit = res.data?.meta?.limit ?? params.limit ?? 10;
        return {
          data: mappedList,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            pendingCount: mappedList.filter((d: any) => d.status === 'pending').length,
          },
        };
      } catch (err: any) {
        console.warn('[AdminApi] getDocuments live fetch failed, fallback to store:', err);
      }
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.documents];

    if (params.status && params.status !== 'all') {
      list = list.filter((d) => d.status === params.status);
    }
    if (params.type && params.type !== 'all') {
      list = list.filter((d) => d.type === params.type);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.userName.toLowerCase().includes(q) ||
          d.userEmail.toLowerCase().includes(q) ||
          d.userPhone.includes(q),
      );
    }

    list.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: {
        total,
        page,
        limit,
        totalPages,
        pendingCount: store.documents.filter((d) => d.status === 'pending').length,
      },
    };
  },

  async verifyDocument(docId: string, reviewerNote?: string): Promise<AdminDocument> {
    const parts = docId.split('-');
    const parsedUserId = parts[1] || '0';
    const parsedType = (parts[2] || 'ktp') as 'ktp' | 'sim';

    if (!isMock) {
      try {
        let userId = parsedUserId;
        let type = parsedType;
        if (!userId || userId === '0') {
          const store = getStoredData();
          const found = store.documents.find((d) => d.id === docId);
          if (found) {
            userId = String(found.userId);
            type = found.type;
          }
        }
        if (userId && userId !== '0') {
          await apiClient.post(`/admin/documents/${userId}/${type}/verify`, {
            action: 'approve',
            note: reviewerNote || 'Dokumen diverifikasi dan sah.',
          });
        }
      } catch (err) {
        console.warn('[AdminApi] verifyDocument API error:', err);
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const doc = store.documents.find((d) => d.id === docId);
    if (!doc) {
      return {
        id: docId,
        userId: parsedUserId,
        userName: '',
        userEmail: '',
        userPhone: '',
        type: parsedType,
        storedName: '',
        fileUrl: '',
        status: 'verified',
        reviewerNote: reviewerNote || 'Dokumen diverifikasi dan sah.',
        uploadedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      };
    }

    doc.status = 'verified';
    doc.reviewerNote = reviewerNote || 'Dokumen diverifikasi dan sah.';
    doc.verifiedAt = new Date().toISOString();

    // Perbarui status dokumen di user terkait
    const user = store.users.find((u) => u.id === doc.userId);
    if (user) {
      if (!user.documents) user.documents = { ktp: 'not_uploaded', sim: 'not_uploaded' };
      user.documents[doc.type] = 'verified';
    }

    saveStore(store);
    recordAudit('VERIFY_DOC', 'Dokumen', `Verifikasi dokumen ${doc.type.toUpperCase()} milik ${doc.userName}`, doc.id);
    return doc;
  },

  async rejectDocument(docId: string, reviewerNote: string): Promise<AdminDocument> {
    const parts = docId.split('-');
    const parsedUserId = parts[1] || '0';
    const parsedType = (parts[2] || 'ktp') as 'ktp' | 'sim';

    if (!isMock) {
      try {
        let userId = parsedUserId;
        let type = parsedType;
        if (!userId || userId === '0') {
          const store = getStoredData();
          const found = store.documents.find((d) => d.id === docId);
          if (found) {
            userId = String(found.userId);
            type = found.type;
          }
        }
        if (userId && userId !== '0') {
          await apiClient.post(`/admin/documents/${userId}/${type}/verify`, {
            action: 'reject',
            rejectionReason: reviewerNote || 'Foto dokumen buram / tidak sesuai.',
            note: reviewerNote,
          });
        }
      } catch (err) {
        console.warn('[AdminApi] rejectDocument API error:', err);
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const doc = store.documents.find((d) => d.id === docId);
    if (!doc) {
      return {
        id: docId,
        userId: parsedUserId,
        userName: '',
        userEmail: '',
        userPhone: '',
        type: parsedType,
        storedName: '',
        fileUrl: '',
        status: 'rejected',
        reviewerNote,
        notes: reviewerNote,
        uploadedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      };
    }

    doc.status = 'rejected';
    doc.reviewerNote = reviewerNote || 'Foto dokumen buram / tidak sesuai.';
    doc.verifiedAt = new Date().toISOString();

    const user = store.users.find((u) => u.id === doc.userId);
    if (user) {
      if (!user.documents) user.documents = { ktp: 'not_uploaded', sim: 'not_uploaded' };
      user.documents[doc.type] = 'rejected';
    }

    saveStore(store);
    recordAudit('REJECT_DOC', 'Dokumen', `Tolak dokumen ${doc.type.toUpperCase()} milik ${doc.userName}: ${reviewerNote}`, doc.id);
    return doc;
  },

  // ==========================================================================
  // 5. Motors (Armada)
  // ==========================================================================
  async getMotors(params: {
    brand?: string;
    type?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
  } = {}): Promise<ApiResponse<Motor[]>> {
    if (!isMock) {
      try {
        const queryParams = new URLSearchParams();
        if (params.brand && params.brand !== 'all') queryParams.append('brand', params.brand);
        if (params.type && params.type !== 'all') queryParams.append('type', params.type);
        if (params.status && params.status !== 'all') queryParams.append('status', params.status);
        if (params.search) queryParams.append('search', params.search);
        if (params.page) queryParams.append('page', String(params.page));
        if (params.limit) queryParams.append('limit', String(params.limit));
        const res = await apiClient.get(`/motors?${queryParams.toString()}`);
        const list = res.data?.data || [];
        const total = res.data?.meta?.total ?? list.length;
        const page = res.data?.meta?.page ?? params.page ?? 1;
        const limit = res.data?.meta?.limit ?? params.limit ?? 10;
        return {
          data: list,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        };
      } catch (err: any) {
        console.warn('[AdminApi] getMotors live fetch failed, fallback to store:', err);
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.motors];

    if (params.brand && params.brand !== 'all') {
      list = list.filter((m) => m.brand === params.brand);
    }
    if (params.type && params.type !== 'all') {
      list = list.filter((m) => m.type === params.type);
    }
    if (params.status && params.status !== 'all') {
      list = list.filter((m) => m.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          m.plate.toLowerCase().includes(q),
      );
    }

    if (params.sort === 'price-asc') list.sort((a, b) => a.pricePerDay - b.pricePerDay);
    else if (params.sort === 'price-desc') list.sort((a, b) => b.pricePerDay - a.pricePerDay);
    else if (params.sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => b.popularity - a.popularity);

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  },

  async getMotorDetail(idOrSlug: string): Promise<ApiResponse<Motor>> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const clean = idOrSlug.trim().toLowerCase();
    const found = store.motors.find((m) => m.id === clean || m.slug.toLowerCase() === clean);
    if (!found) throw new Error('Data motor tidak ditemukan.');
    return { data: found };
  },

  async getMotorById(idOrSlug: string): Promise<Motor> {
    const res = await this.getMotorDetail(idOrSlug);
    return res.data;
  },

  async updateMotorStatus(id: string, status: 'available' | 'maintenance' | 'inactive'): Promise<Motor> {
    const store = getStoredData();
    if (status !== 'available') {
      const today = new Date().toISOString().split('T')[0];
      const conflicting = store.bookings.filter(
        (b) => b.motorId === id && ['pending', 'confirmed', 'active'].includes(b.status) && b.endDate >= today,
      );
      if (conflicting.length > 0) {
        const list = conflicting.map((c) => `#${c.code || c.bookingCode} (${c.startDate} s/d ${c.endDate})`).join(', ');
        const err: any = new Error(
          `Tidak dapat mengubah status motor ke "${status}" karena masih memiliki ${conflicting.length} pemesanan aktif/mendatang: ${list}.`,
        );
        err.code = 'MOTOR_HAS_BOOKINGS';
        err.conflicts = conflicting;
        throw err;
      }
    }
    return this.updateMotor(id, { status });
  },

  async createMotor(motorData: Partial<Motor>): Promise<Motor> {
    await delay(450);
    checkSimulateError();
    const store = getStoredData();
    const newId = String(Date.now());
    const slug = (motorData.slug || motorData.name || 'motor')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const newMotor: Motor = {
      id: newId,
      slug,
      name: motorData.name || 'Unit Motor Baru',
      brand: motorData.brand || 'Honda',
      type: motorData.type || 'matic',
      cc: motorData.cc || 125,
      year: motorData.year || 2024,
      color: motorData.color || 'Hitam',
      transmission: motorData.transmission || 'Otomatis',
      fuelCapacity: motorData.fuelCapacity || 4.2,
      pricePerDay: motorData.pricePerDay || 100000,
      deposit: motorData.deposit || 200000,
      description: motorData.description || '',
      features: motorData.features || ['Helm SNI', 'Jas Hujan'],
      images: motorData.images && motorData.images.length > 0
        ? motorData.images
        : ['https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=800'],
      status: motorData.status || 'available',
      rating: 5.0,
      reviewCount: 0,
      plate: motorData.plate || `DK ${Math.floor(1000 + Math.random() * 9000)} RK`,
      popularity: 80,
    };

    store.motors.unshift(newMotor);
    saveStore(store);
    recordAudit('CREATE_MOTOR', 'Armada', `Tambah unit motor baru: ${newMotor.name} (${newMotor.plate})`, newMotor.id);
    return newMotor;
  },

  async updateMotor(id: string, patch: Partial<Motor>): Promise<Motor> {
    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const idx = store.motors.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error('Data motor tidak ditemukan.');

    const updated = { ...store.motors[idx], ...patch };
    store.motors[idx] = updated;
    saveStore(store);
    recordAudit('UPDATE_MOTOR', 'Armada', `Perbarui data motor ${updated.name} (${updated.plate})`, updated.id);
    return updated;
  },

  async deleteMotor(id: string): Promise<void> {
    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const motor = store.motors.find((m) => m.id === id);
    if (!motor) throw new Error('Data motor tidak ditemukan.');

    const today = new Date().toISOString().split('T')[0];
    const conflicting = store.bookings.filter(
      (b) => b.motorId === id && ['pending', 'confirmed', 'active'].includes(b.status) && b.endDate >= today,
    );
    if (conflicting.length > 0) {
      const list = conflicting.map((c) => `#${c.code || c.bookingCode} (${c.startDate} s/d ${c.endDate})`).join(', ');
      throw new Error(`Unit motor tidak dapat dinonaktifkan karena memiliki booking aktif/mendatang: ${list}`);
    }

    // Tidak ada hapus permanen: alihkan status ke maintenance/nonaktif
    motor.status = 'maintenance';
    saveStore(store);
    recordAudit('DEACTIVATE_MOTOR', 'Armada', `Nonaktifkan unit motor ${motor.name} (${motor.plate})`, motor.id);
  },

  async toggleMotorStatus(id: string, newStatus: 'available' | 'maintenance'): Promise<Motor> {
    return this.updateMotorStatus(id, newStatus);
  },

  // ==========================================================================
  // 6. Calendar & Availability
  // ==========================================================================
  async getCalendarData(): Promise<ApiResponse<{
    motors: Motor[];
    bookings: AdminBooking[];
    maintenance: MaintenanceBlock[];
  }>> {
    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    return {
      data: {
        motors: store.motors,
        bookings: store.bookings.filter((b) => b.status !== 'cancelled'),
        maintenance: store.maintenance.filter((m) => m.status !== 'completed'),
      },
    };
  },

  // ==========================================================================
  // 7. Maintenance (Perawatan & Servis)
  // ==========================================================================
  async getMaintenanceBlocks(params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<MaintenanceBlock[]>> {
    if (!isMock) {
      try {
        const queryParams = new URLSearchParams();
        if (params.status && params.status !== 'all') queryParams.append('status', params.status);
        if (params.search) queryParams.append('search', params.search);
        if (params.page) queryParams.append('page', String(params.page));
        if (params.limit) queryParams.append('limit', String(params.limit));
        const res = await apiClient.get(`/admin/maintenance?${queryParams.toString()}`);
        const list = res.data?.data || [];
        const total = res.data?.meta?.total ?? list.length;
        const page = res.data?.meta?.page ?? params.page ?? 1;
        const limit = res.data?.meta?.limit ?? params.limit ?? 10;
        return {
          data: list,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        };
      } catch (err: any) {
        console.warn('[AdminApi] getMaintenanceBlocks live fetch failed, fallback to store:', err);
      }
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.maintenance];

    if (params.status && params.status !== 'all') {
      list = list.filter((m) => m.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          (m.motorName || m.motorcycleName || '').toLowerCase().includes(q) ||
          (m.motorPlate || '').toLowerCase().includes(q) ||
          (m.reason || '').toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages },
    };
  },

  async createMaintenanceBlock(blockData: {
    motorId: string;
    startDate: string;
    endDate: string;
    reason: string;
    cost?: number;
    technician?: string;
  }): Promise<MaintenanceBlock> {
    if (!isMock) {
      try {
        const res = await apiClient.post('/admin/maintenance', {
          motorcycleId: blockData.motorId,
          startDate: blockData.startDate,
          endDate: blockData.endDate,
          reason: blockData.reason,
          cost: blockData.cost || 0,
        });
        return res.data?.data;
      } catch (err: any) {
        if (err.response?.data?.message) {
          throw new Error(err.response.data.message);
        }
        throw err;
      }
    }

    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const motor = store.motors.find((m) => m.id === blockData.motorId);
    if (!motor) throw new Error('Motor tidak ditemukan.');

    // Pengecekan bentrok dengan booking aktif/mendatang (pending, confirmed, active)
    const conflictingBookings = store.bookings.filter(
      (b) =>
        b.motorId === blockData.motorId &&
        ['pending', 'confirmed', 'active'].includes(b.status) &&
        !(b.endDate <= blockData.startDate || b.startDate >= blockData.endDate),
    );

    if (conflictingBookings.length > 0) {
      const list = conflictingBookings
        .map((b) => `#${b.code || b.bookingCode} (${b.startDate} s/d ${b.endDate}, status: ${b.status})`)
        .join(', ');
      const err: any = new Error(
        `Jadwal servis bertabrakan dengan booking aktif pelanggan: ${list}. Admin harus menyelesaikan atau menjadwalkan ulang booking tersebut terlebih dahulu.`,
      );
      err.code = 'MAINTENANCE_CONFLICT';
      err.conflicts = conflictingBookings;
      throw err;
    }

    const newBlock: MaintenanceBlock = {
      id: 'maint-' + Date.now(),
      motorId: motor.id,
      motorName: motor.name,
      motorPlate: motor.plate,
      startDate: blockData.startDate,
      endDate: blockData.endDate,
      reason: blockData.reason,
      cost: blockData.cost || 0,
      status: 'scheduled',
      technician: blockData.technician || 'Bengkel Rekanan RodaKita',
      createdAt: new Date().toISOString(),
    };

    // Tandai motor menjadi maintenance jika tanggal mulai adalah hari ini atau sebelumnya
    const todayStr = new Date().toISOString().split('T')[0];
    if (blockData.startDate <= todayStr && blockData.endDate >= todayStr) {
      motor.status = 'maintenance';
    }

    store.maintenance.unshift(newBlock);
    saveStore(store);
    recordAudit('CREATE_MAINTENANCE', 'Perawatan', `Jadwalkan servis untuk ${motor.name} (${motor.plate}): ${blockData.reason}`, newBlock.id);
    return newBlock;
  },

  async completeMaintenanceBlock(id: string, cost?: number, notes?: string): Promise<MaintenanceBlock> {
    if (!isMock) {
      try {
        const res = await apiClient.post(`/admin/maintenance/${id}/complete`, {
          cost: cost !== undefined ? Number(cost) : undefined,
          notes: notes || 'Servis selesai',
          completionNotes: notes || 'Servis selesai',
        });
        return res.data?.data;
      } catch (err: any) {
        if (err.response?.data?.message) {
          throw new Error(err.response.data.message);
        }
        throw err;
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const block = store.maintenance.find((m) => m.id === id);
    if (!block) throw new Error('Jadwal servis tidak ditemukan.');

    block.status = 'completed';
    if (cost !== undefined) block.cost = cost;
    if (notes) block.notes = notes;

    // Kembalikan status motor ke available
    const motor = store.motors.find((m) => m.id === block.motorId);
    if (motor) {
      motor.status = 'available';
    }

    saveStore(store);
    recordAudit('COMPLETE_MAINTENANCE', 'Perawatan', `Selesai servis ${block.motorName}: Biaya Rp ${(block.cost || 0).toLocaleString('id-ID')}`, block.id);
    return block;
  },

  // ==========================================================================
  // 8. Users
  // ==========================================================================
  async getUsers(params: {
    role?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<AdminUser[]>> {
    if (!isMock) {
      try {
        const headers = await getAdminHeaders();
        const res = await apiClient.get('/admin/users', { params, headers });
        if (res.data && res.data.data) {
          const mapped: AdminUser[] = res.data.data.map((u: any) => ({
            ...u,
            id: String(u.id),
            role: u.role,
            isActive: u.isActive ?? true,
            createdAt: u.createdAt || new Date().toISOString(),
          }));
          return {
            data: mapped,
            meta: {
              total: res.data.meta?.total ?? mapped.length,
              page: res.data.meta?.page ?? params.page ?? 1,
              limit: res.data.meta?.limit ?? params.limit ?? 10,
              totalPages: Math.max(1, Math.ceil((res.data.meta?.total ?? mapped.length) / (params.limit || 10))),
            },
          };
        }
      } catch (err) {
        console.warn('[AdminApi] getUsers live fetch failed, fallback to store:', err);
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.users];

    if (params.role && params.role !== 'all') {
      list = list.filter((u) => u.role === params.role);
    }
    if (params.status && params.status !== 'all') {
      const isAct = params.status === 'active';
      list = list.filter((u) => u.isActive === isAct);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.includes(q),
      );
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages },
    };
  },

  async getUserDetail(id: string): Promise<ApiResponse<AdminUser & { bookings: AdminBooking[]; documentsList: AdminDocument[] }>> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const user = store.users.find((u) => u.id === id);
    if (!user) throw new Error('Pengguna tidak ditemukan.');

    const userBookings = store.bookings.filter((b) => b.userId === id);
    const userDocs = store.documents.filter((d) => d.userId === id);

    return {
      data: {
        ...user,
        bookings: userBookings,
        documents: user.documents,
        documentsList: userDocs,
      },
    };
  },

  async getUserById(id: string): Promise<AdminUser> {
    const res = await this.getUserDetail(id);
    return res.data;
  },

  async getUserRenterProfile(id: string | number): Promise<any> {
    if (!isMock) {
      try {
        const headers = await getAdminHeaders();
        const res = await apiClient.get(`/admin/users/${id}/renter-profile`, { headers });
        return res.data?.data || null;
      } catch {
        return null;
      }
    }
    return null;
  },

  async updateUserRole(id: string, role: AdminRole): Promise<AdminUser> {
    const store = getStoredData();
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === id) {
      const err: any = new Error('Anda tidak diperbolehkan mengubah peran akun Anda sendiri.');
      err.code = 'SELF_ROLE_CHANGE';
      throw err;
    }

    const targetUser = store.users.find((u) => u.id === id);
    if (!targetUser) throw new Error('Pengguna tidak ditemukan.');

    if (targetUser.role === 'admin' && role !== 'admin') {
      const remainingAdmins = store.users.filter((u) => u.id !== id && u.role === 'admin' && u.isActive);
      if (remainingAdmins.length === 0) {
        const err: any = new Error('Operasi ditolak: Sistem tidak boleh menyisakan nol admin utama.');
        err.code = 'LAST_ADMIN';
        throw err;
      }
    }

    return this.updateUser(id, { role });
  },

  async createUser(userData: Partial<AdminUser>): Promise<AdminUser> {
    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const newId = 'u-' + Date.now();

    const newUser: AdminUser = {
      id: newId,
      name: userData.name || 'Pengguna Baru',
      email: (userData.email || `user${Date.now()}@rodakita.id`).toLowerCase(),
      phone: userData.phone || '081234567890',
      address: userData.address || '',
      role: userData.role || 'customer',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    store.users.unshift(newUser);
    saveStore(store);
    recordAudit('CREATE_USER', 'Pengguna', `Tambah pengguna baru: ${newUser.name} (${newUser.role})`, newUser.id);
    return newUser;
  },

  async updateUser(id: string, patch: Partial<AdminUser>): Promise<AdminUser> {
    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('Pengguna tidak ditemukan.');

    const updated = { ...store.users[idx], ...patch };
    store.users[idx] = updated;
    saveStore(store);
    recordAudit('UPDATE_USER', 'Pengguna', `Perbarui data pengguna ${updated.name}`, updated.id);
    return updated;
  },

  async toggleUserStatus(id: string): Promise<AdminUser> {
    const store = getStoredData();
    const u = store.users.find((x) => x.id === id);
    if (!u) throw new Error('Pengguna tidak ditemukan.');

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === id && u.isActive) {
      const err: any = new Error('Anda tidak dapat menonaktifkan akun Anda sendiri.');
      err.code = 'SELF_DEACTIVATION';
      throw err;
    }

    if (u.isActive && u.role === 'admin') {
      const remainingAdmins = store.users.filter((x) => x.id !== id && x.role === 'admin' && x.isActive);
      if (remainingAdmins.length === 0) {
        const err: any = new Error('Operasi ditolak: Tidak dapat menonaktifkan admin terakhir dalam sistem.');
        err.code = 'LAST_ADMIN';
        throw err;
      }
    }

    return this.updateUser(id, { isActive: !u.isActive });
  },

  // ==========================================================================
  // 9. Reviews
  // ==========================================================================
  async getReviews(params: {
    rating?: number;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<AdminReview[]>> {
    if (!isMock) {
      try {
        const queryParams = new URLSearchParams();
        if (params.rating) queryParams.append('rating', String(params.rating));
        if (params.status && params.status !== 'all') queryParams.append('status', params.status);
        if (params.search) queryParams.append('search', params.search);
        if (params.page) queryParams.append('page', String(params.page));
        if (params.limit) queryParams.append('limit', String(params.limit));
        const res = await apiClient.get(`/admin/reviews?${queryParams.toString()}`);
        const list = res.data?.data || [];
        const total = res.data?.meta?.total ?? list.length;
        const page = res.data?.meta?.page ?? params.page ?? 1;
        const limit = res.data?.meta?.limit ?? params.limit ?? 10;
        return {
          data: list,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        };
      } catch (err: any) {
        console.warn('[AdminApi] getReviews live fetch failed, fallback to store:', err);
      }
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.reviews];

    if (params.rating) {
      list = list.filter((r) => r.rating === Number(params.rating));
    }
    if (params.status && params.status !== 'all') {
      list = list.filter((r) => r.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.userName || '').toLowerCase().includes(q) ||
          (r.motorName || '').toLowerCase().includes(q) ||
          (r.comment || '').toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages },
    };
  },

  async moderateReview(id: string, status: 'published' | 'hidden'): Promise<AdminReview> {
    if (!isMock) {
      try {
        const isVisible = status === 'published';
        const res = await apiClient.patch(`/admin/reviews/${id}/visibility`, {
          isVisible,
          is_visible: isVisible,
          status,
        });
        return res.data?.data;
      } catch (err: any) {
        if (err.response?.data?.message) {
          throw new Error(err.response.data.message);
        }
        throw err;
      }
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const r = store.reviews.find((x) => x.id === id);
    if (!r) throw new Error('Ulasan tidak ditemukan.');
    r.status = status;
    saveStore(store);
    recordAudit('MODERATE_REVIEW', 'Ulasan', `Ubah status ulasan dari ${r.userName} ke: ${status}`, r.id);
    return r;
  },

  // ==========================================================================
  // 10. Promos
  // ==========================================================================
  async getPromos(params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<PromoItem[]>> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.promos];

    if (params.status && params.status !== 'all') {
      const isAct = params.status === 'active';
      list = list.filter((p) => p.isActive === isAct);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter((p) => p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q));
    }

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages },
    };
  },

  async createPromo(promoData: Partial<PromoItem>): Promise<PromoItem> {
    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    const newPromo: PromoItem = {
      id: 'p-' + Date.now(),
      code: (promoData.code || 'PROMO' + Math.floor(Math.random() * 1000)).toUpperCase(),
      name: promoData.name || 'Promo Baru',
      discountPercent: promoData.discountPercent || 10,
      maxDiscount: promoData.maxDiscount || 50000,
      minSubtotal: promoData.minSubtotal || 200000,
      usageLimit: promoData.usageLimit || 50,
      usedCount: 0,
      isActive: true,
      startDate: promoData.startDate || new Date().toISOString().split('T')[0],
      expiresAt: promoData.expiresAt || '2026-12-31',
    };

    store.promos.unshift(newPromo);
    saveStore(store);
    recordAudit('CREATE_PROMO', 'Promosi', `Buat kode promo baru: ${newPromo.code}`, newPromo.id);
    return newPromo;
  },

  async updatePromo(id: string, patch: Partial<PromoItem>): Promise<PromoItem> {
    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const idx = store.promos.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Promo tidak ditemukan.');
    const updated = { ...store.promos[idx], ...patch };
    store.promos[idx] = updated;
    saveStore(store);
    recordAudit('UPDATE_PROMO', 'Promosi', `Perbarui kode promo ${updated.code}`, updated.id);
    return updated;
  },

  async deletePromo(id: string): Promise<void> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const p = store.promos.find((x) => x.id === id);
    if (!p) return;

    const isUsed = (p.usedCount && p.usedCount > 0) || store.bookings.some((b) => (b as any).promoCode === p.code || (b as any).voucherCode === p.code);
    if (isUsed) {
      p.isActive = false;
      saveStore(store);
      recordAudit('DEACTIVATE_PROMO', 'Promosi', `Promo ${p.code} pernah digunakan, dialihkan ke Nonaktif`, p.id);
      return;
    }

    store.promos = store.promos.filter((x) => x.id !== id);
    saveStore(store);
    recordAudit('DELETE_PROMO', 'Promosi', `Hapus kode promo ${p.code}`, p.id);
  },

  // ==========================================================================
  // 11. Addons
  // ==========================================================================
  async getAddons(params?: { search?: string }): Promise<ApiResponse<AddonItem[]>> {
    await delay(250);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.addons];
    if (params?.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q));
    }
    return { data: list };
  },

  async createAddon(addonData: Partial<AddonItem>): Promise<AddonItem> {
    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const newAddon: AddonItem = {
      id: 'addon-' + Date.now(),
      name: addonData.name || 'Add-on Baru',
      pricePerDay: addonData.pricePerDay || 10000,
      description: addonData.description || '',
      stock: addonData.stock || 20,
      isActive: true,
    };
    store.addons.push(newAddon);
    saveStore(store);
    recordAudit('CREATE_ADDON', 'Add-on', `Tambah add-on baru: ${newAddon.name}`, newAddon.id);
    return newAddon;
  },

  async updateAddon(id: string, patch: Partial<AddonItem>): Promise<AddonItem> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const idx = store.addons.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('Addon tidak ditemukan.');
    const updated = { ...store.addons[idx], ...patch };
    store.addons[idx] = updated;
    saveStore(store);
    recordAudit('UPDATE_ADDON', 'Add-on', `Perbarui add-on ${updated.name}`, updated.id);
    return updated;
  },

  async deleteAddon(id: string): Promise<void> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const a = store.addons.find((x) => x.id === id);
    if (!a) return;

    const isUsed = store.bookings.some((b) => b.addonsList?.some((addon) => addon.id === id || addon.name === a.name));
    if (isUsed) {
      a.isActive = false;
      saveStore(store);
      recordAudit('DEACTIVATE_ADDON', 'Add-on', `Add-on ${a.name} pernah digunakan, dialihkan ke Nonaktif`, a.id);
      return;
    }

    store.addons = store.addons.filter((x) => x.id !== id);
    saveStore(store);
    recordAudit('DELETE_ADDON', 'Add-on', `Hapus add-on ${a.name}`, a.id);
  },

  // ==========================================================================
  // 12. Locations
  // ==========================================================================
  async getLocations(params?: { search?: string }): Promise<ApiResponse<LocationItem[]>> {
    await delay(250);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.locations];
    if (params?.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter((l) => l.name.toLowerCase().includes(q) || (l.address || '').toLowerCase().includes(q));
    }
    return { data: list };
  },

  async createLocation(locationData: Partial<LocationItem>): Promise<LocationItem> {
    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const newLoc: LocationItem = {
      id: 'loc-' + Date.now(),
      name: locationData.name || 'Lokasi Baru',
      address: locationData.address || '',
      type: locationData.type || 'delivery_point',
      deliveryFee: locationData.deliveryFee || 25000,
      isActive: true,
    };
    store.locations.push(newLoc);
    saveStore(store);
    recordAudit('CREATE_LOCATION', 'Lokasi', `Tambah lokasi baru: ${newLoc.name}`, newLoc.id);
    return newLoc;
  },

  async updateLocation(id: string, patch: Partial<LocationItem>): Promise<LocationItem> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const idx = store.locations.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error('Lokasi tidak ditemukan.');
    const updated = { ...store.locations[idx], ...patch };
    store.locations[idx] = updated;
    saveStore(store);
    recordAudit('UPDATE_LOCATION', 'Lokasi', `Perbarui lokasi ${updated.name}`, updated.id);
    return updated;
  },

  async deleteLocation(id: string): Promise<void> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    const loc = store.locations.find((x) => x.id === id);
    if (!loc) return;

    const isUsed = store.bookings.some(
      (b) => b.pickupLocation === loc.name || b.returnLocation === loc.name || b.pickupAddress === loc.address,
    );
    if (isUsed) {
      loc.isActive = false;
      saveStore(store);
      recordAudit('DEACTIVATE_LOCATION', 'Lokasi', `Lokasi ${loc.name} pernah digunakan, dialihkan ke Nonaktif`, loc.id);
      return;
    }

    store.locations = store.locations.filter((x) => x.id !== id);
    saveStore(store);
    recordAudit('DELETE_LOCATION', 'Lokasi', `Hapus lokasi ${loc.name}`, loc.id);
  },

  // ==========================================================================
  // 13. Settings
  // ==========================================================================
  async getSettings(): Promise<ApiResponse<SystemSettings>> {
    if (!isMock) {
      try {
        const res = await apiClient.get('/admin/settings');
        if (res.data?.data) {
          const s = res.data.data;
          const normalized: SystemSettings = {
            storeName: s.brandName || 'RodaKita Rental',
            brandName: s.brandName || 'RodaKita Rental',
            phone: s.whatsappNumber || '',
            whatsapp: s.whatsappNumber || '',
            whatsappNumber: s.whatsappNumber || '',
            contactWhatsapp: s.whatsappNumber || '',
            email: s.contactEmail || '',
            contactEmail: s.contactEmail || '',
            address: s.address || '',
            officeAddress: s.address || '',
            operationalHours: s.operatingHours || '08:00 - 21:00 WIB',
            minRentalDays: s.minRentalDays ?? 1,
            maxRentalDays: s.maxRentalDays ?? 30,
            defaultDeposit: s.defaultDeposit ?? 200000,
            depositAmount: s.defaultDeposit ?? 200000,
            lateFeePercentPerHour: s.lateFeePercentPerHour ?? 10,
            lateFeePerHour: s.lateFeePercentPerHour ?? 10,
            lateFeeToleranceMinutes: s.lateFeeToleranceMinutes ?? 120,
            cancellationThresholdHours: s.cancellationThresholdHours ?? 24,
            cancellationRefundPercent: s.cancellationRefundPercent ?? 50,
            cancellationPolicy: s.cancellationPolicy,
            minRenterAge: s.minRenterAge ?? 18,
            bookingExpireMinutes: s.bookingExpireMinutes ?? s.paymentExpiryMinutes ?? 60,
            bookingExpirationMinutes: s.bookingExpireMinutes ?? s.paymentExpiryMinutes ?? 60,
            paymentExpiryMinutes: s.paymentExpiryMinutes ?? s.bookingExpireMinutes ?? 60,
            requireVerifiedDocs: false,
            autoVerifyDocs: true,
            weekendSurcharge: false,
            paymentGatewayActive: true,
          };
          return { data: normalized };
        }
      } catch (err) {
        console.warn('[AdminApi] getSettings live fetch failed, fallback to store:', err);
      }
    }

    await delay(250);
    checkSimulateError();
    const store = getStoredData();
    return { data: store.settings };
  },

  async updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    if (!isMock) {
      try {
        const payload: Record<string, any> = {};
        if (patch.brandName !== undefined) payload.brandName = patch.brandName;
        else if (patch.storeName !== undefined) payload.brandName = patch.storeName;

        if (patch.whatsappNumber !== undefined) payload.whatsappNumber = patch.whatsappNumber;
        else if (patch.whatsapp !== undefined) payload.whatsappNumber = patch.whatsapp;
        else if (patch.contactWhatsapp !== undefined) payload.whatsappNumber = patch.contactWhatsapp;

        if (patch.contactEmail !== undefined) payload.contactEmail = patch.contactEmail;
        else if (patch.email !== undefined) payload.contactEmail = patch.email;

        if (patch.address !== undefined) payload.address = patch.address;
        else if (patch.officeAddress !== undefined) payload.address = patch.officeAddress;

        if (patch.operationalHours !== undefined) payload.operatingHours = patch.operationalHours;

        if (patch.minRentalDays !== undefined) payload.minRentalDays = Number(patch.minRentalDays);
        if (patch.maxRentalDays !== undefined) payload.maxRentalDays = Number(patch.maxRentalDays);
        if (patch.minRenterAge !== undefined) payload.minRenterAge = Number(patch.minRenterAge);

        if (patch.bookingExpireMinutes !== undefined) payload.bookingExpireMinutes = Number(patch.bookingExpireMinutes);
        else if (patch.bookingExpirationMinutes !== undefined) payload.bookingExpireMinutes = Number(patch.bookingExpirationMinutes);
        else if (patch.paymentExpiryMinutes !== undefined) payload.bookingExpireMinutes = Number(patch.paymentExpiryMinutes);

        if (patch.lateFeeToleranceMinutes !== undefined) payload.lateFeeToleranceMinutes = Number(patch.lateFeeToleranceMinutes);
        if (patch.lateFeePercentPerHour !== undefined) payload.lateFeePercentPerHour = Number(patch.lateFeePercentPerHour);
        else if (patch.lateFeePerHour !== undefined) payload.lateFeePercentPerHour = Number(patch.lateFeePerHour);

        if (patch.defaultDeposit !== undefined) payload.defaultDeposit = Number(patch.defaultDeposit);
        else if (patch.depositAmount !== undefined) payload.defaultDeposit = Number(patch.depositAmount);

        if (patch.cancellationThresholdHours !== undefined) payload.cancellationThresholdHours = Number(patch.cancellationThresholdHours);
        if (patch.cancellationRefundPercent !== undefined) payload.cancellationRefundPercent = Number(patch.cancellationRefundPercent);
        if (patch.cancellationPolicy !== undefined) payload.cancellationPolicy = patch.cancellationPolicy;

        const res = await apiClient.put('/admin/settings', payload);
        const s = res.data?.data;
        if (s) {
          return {
            ...patch,
            brandName: s.brandName,
            storeName: s.brandName,
            whatsappNumber: s.whatsappNumber,
            whatsapp: s.whatsappNumber,
            contactEmail: s.contactEmail,
            email: s.contactEmail,
            address: s.address,
            officeAddress: s.address,
            operationalHours: s.operatingHours,
            minRentalDays: s.minRentalDays,
            maxRentalDays: s.maxRentalDays,
            minRenterAge: s.minRenterAge,
            bookingExpireMinutes: s.bookingExpireMinutes,
            lateFeeToleranceMinutes: s.lateFeeToleranceMinutes,
            lateFeePercentPerHour: s.lateFeePercentPerHour,
            defaultDeposit: s.defaultDeposit,
            cancellationPolicy: s.cancellationPolicy,
          } as SystemSettings;
        }
      } catch (err) {
        console.error('[AdminApi] updateSettings live call failed:', err);
        throw err;
      }
    }

    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    store.settings = { ...store.settings, ...patch };
    saveStore(store);
    recordAudit('UPDATE_SETTINGS', 'Pengaturan', 'Memperbarui konfigurasi sistem & aturan sewa');
    return store.settings;
  },

  async resetSettings(): Promise<SystemSettings> {
    if (!isMock) {
      try {
        const res = await apiClient.post('/admin/settings/reset');
        const s = res.data?.data;
        if (s) {
          return {
            brandName: s.brandName,
            storeName: s.brandName,
            whatsappNumber: s.whatsappNumber,
            whatsapp: s.whatsappNumber,
            contactEmail: s.contactEmail,
            email: s.contactEmail,
            address: s.address,
            officeAddress: s.address,
            operationalHours: s.operatingHours,
            minRentalDays: s.minRentalDays,
            maxRentalDays: s.maxRentalDays,
            minRenterAge: s.minRenterAge,
            bookingExpireMinutes: s.bookingExpireMinutes,
            bookingExpirationMinutes: s.bookingExpireMinutes,
            lateFeeToleranceMinutes: s.lateFeeToleranceMinutes,
            lateFeePercentPerHour: s.lateFeePercentPerHour,
            lateFeePerHour: s.lateFeePercentPerHour,
            defaultDeposit: s.defaultDeposit,
            depositAmount: s.defaultDeposit,
            cancellationPolicy: s.cancellationPolicy,
            requireVerifiedDocs: false,
            autoVerifyDocs: true,
            weekendSurcharge: false,
            paymentGatewayActive: true,
          } as SystemSettings;
        }
      } catch (err) {
        console.error('[AdminApi] resetSettings live call failed:', err);
        throw err;
      }
    }

    await delay(400);
    checkSimulateError();
    const store = getStoredData();
    store.settings = { ...initialSystemSettings };
    saveStore(store);
    recordAudit('RESET_SETTINGS', 'Pengaturan', 'Mereset konfigurasi sistem ke nilai bawaan');
    return store.settings;
  },

  // ==========================================================================
  // 14. Messages
  // ==========================================================================
  async getMessages(params: {
    isRead?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<ContactMessage[]>> {
    if (!isMock) {
      try {
        const queryParams = new URLSearchParams();
        if (params.search) queryParams.append('search', params.search);
        if (params.page) queryParams.append('page', String(params.page));
        if (params.limit) queryParams.append('limit', String(params.limit));
        const res = await apiClient.get(`/admin/messages?${queryParams.toString()}`);
        const list = res.data?.data || [];
        const total = res.data?.meta?.total ?? list.length;
        const page = res.data?.meta?.page ?? params.page ?? 1;
        const limit = res.data?.meta?.limit ?? params.limit ?? 10;
        const unreadCount = res.data?.meta?.unreadCount ?? list.filter((m: any) => !m.isRead).length;
        return {
          data: list,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            unreadCount,
          },
        };
      } catch (err: any) {
        console.warn('[AdminApi] getMessages live fetch failed, fallback to store:', err);
      }
    }

    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.messages];

    if (params.isRead !== undefined) {
      list = list.filter((m) => m.isRead === params.isRead);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q) ||
          m.message.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: {
        total,
        page,
        limit,
        totalPages,
        unreadCount: store.messages.filter((m) => !m.isRead).length,
      },
    };
  },

  async markMessageRead(id: string): Promise<ContactMessage> {
    if (!isMock) {
      try {
        const res = await apiClient.patch(`/admin/messages/${id}/read`);
        return res.data?.data;
      } catch (err: any) {
        if (err.response?.data?.message) {
          throw new Error(err.response.data.message);
        }
        throw err;
      }
    }

    await delay(200);
    checkSimulateError();
    const store = getStoredData();
    const msg = store.messages.find((m) => m.id === id);
    if (!msg) throw new Error('Pesan tidak ditemukan.');
    msg.isRead = true;
    saveStore(store);
    return msg;
  },

  async replyMessage(id: string, replyNote: string): Promise<ContactMessage> {
    if (!isMock) {
      try {
        const res = await apiClient.post(`/admin/messages/${id}/reply`, {
          replyText: replyNote,
          replyNote,
          message: replyNote,
        });
        return res.data?.data;
      } catch (err: any) {
        if (err.response?.data?.message) {
          throw new Error(err.response.data.message);
        }
        throw err;
      }
    }

    await delay(350);
    checkSimulateError();
    const store = getStoredData();
    const msg = store.messages.find((m) => m.id === id);
    if (!msg) throw new Error('Pesan tidak ditemukan.');
    msg.isRead = true;
    msg.repliedAt = new Date().toISOString();
    msg.replyNote = replyNote;
    saveStore(store);
    recordAudit('REPLY_MESSAGE', 'Pesan', `Membalas pesan dari ${msg.name}: "${replyNote}"`, msg.id);
    return msg;
  },

  // ==========================================================================
  // 15. Reports & Analytics
  // ==========================================================================
  async getReportData(_params: { startDate?: string; endDate?: string } = {}): Promise<ApiResponse<ReportSummary>> {
    return this.getDashboardStats();
  },

  // ==========================================================================
  // 16. Audit Log
  // ==========================================================================
  async getAuditLogs(params: {
    module?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<AuditLogEntry[]>> {
    await delay(300);
    checkSimulateError();
    const store = getStoredData();
    let list = [...store.auditLogs];

    if (params.module && params.module !== 'all') {
      list = list.filter((a) => a.module === params.module);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.actorName.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q) ||
          a.details.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 15);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    return {
      data: list.slice(offset, offset + limit),
      meta: { total, page, limit, totalPages },
    };
  },

  // ==========================================================================
  // 17. Content Management (Pages, FAQs, Blocks)
  // ==========================================================================
  async getPages(): Promise<ApiResponse<AdminPageItem[]>> {
    if (!isMock) {
      const res = await apiClient.get('/admin/pages');
      return { data: res.data?.data || [] };
    }
    await delay(200);
    return {
      data: [
        { id: 1, slug: 'terms', title: 'Syarat dan Ketentuan', bodyLength: 1200, version: 1, isPublished: true, updatedAt: new Date().toISOString() },
        { id: 2, slug: 'privacy', title: 'Kebijakan Privasi', bodyLength: 850, version: 1, isPublished: true, updatedAt: new Date().toISOString() },
        { id: 3, slug: 'how-it-works', title: 'Cara Sewa', bodyLength: 1500, version: 1, isPublished: true, updatedAt: new Date().toISOString() },
        { id: 4, slug: 'about', title: 'Tentang Kami', bodyLength: 900, version: 1, isPublished: true, updatedAt: new Date().toISOString() },
      ],
    };
  },

  async getPage(slug: string): Promise<ApiResponse<AdminPageDetail>> {
    if (!isMock) {
      const res = await apiClient.get(`/admin/pages/${slug}`);
      return { data: res.data?.data };
    }
    await delay(200);
    return {
      data: {
        id: 1,
        slug,
        title: slug === 'terms' ? 'Syarat dan Ketentuan' : slug === 'privacy' ? 'Kebijakan Privasi' : slug === 'how-it-works' ? 'Cara Sewa' : 'Tentang Kami',
        body: `# Halaman ${slug}\n\nIsi markdown halaman ${slug}.`,
        version: 1,
        isPublished: true,
        updatedAt: new Date().toISOString(),
      },
    };
  },

  async updatePage(slug: string, data: { title: string; body: string; note?: string }): Promise<ApiResponse<AdminPageDetail>> {
    if (!isMock) {
      const res = await apiClient.put(`/admin/pages/${slug}`, data);
      return { data: res.data?.data };
    }
    await delay(300);
    return {
      data: {
        id: 1,
        slug,
        title: data.title,
        body: data.body,
        version: 2,
        isPublished: true,
        updatedAt: new Date().toISOString(),
      },
    };
  },

  async togglePagePublished(slug: string, isPublished: boolean): Promise<ApiResponse<AdminPageDetail>> {
    if (!isMock) {
      const res = await apiClient.patch(`/admin/pages/${slug}/publish`, { isPublished });
      return { data: res.data?.data };
    }
    await delay(200);
    return {
      data: {
        id: 1,
        slug,
        title: 'Halaman',
        body: '',
        version: 1,
        isPublished,
        updatedAt: new Date().toISOString(),
      },
    };
  },

  async getPageVersions(slug: string): Promise<ApiResponse<AdminPageVersion[]>> {
    if (!isMock) {
      const res = await apiClient.get(`/admin/pages/${slug}/versions`);
      return { data: res.data?.data || [] };
    }
    await delay(200);
    return {
      data: [
        { id: 1, version: 1, title: 'Versi Awal', bodyLength: 1000, changeNote: 'Inisialisasi sistem', createdAt: new Date().toISOString() },
      ],
    };
  },

  async restorePageVersion(slug: string, version: number): Promise<ApiResponse<AdminPageDetail>> {
    if (!isMock) {
      const res = await apiClient.post(`/admin/pages/${slug}/versions/${version}/restore`);
      return { data: res.data?.data };
    }
    await delay(300);
    return {
      data: {
        id: 1,
        slug,
        title: 'Dipulihkan',
        body: '',
        version: version + 1,
        isPublished: true,
        updatedAt: new Date().toISOString(),
      },
    };
  },

  async previewMarkdown(body: string): Promise<ApiResponse<{ html: string }>> {
    if (!isMock) {
      const res = await apiClient.post('/admin/pages/preview', { body });
      return { data: res.data?.data };
    }
    await delay(150);
    return { data: { html: `<p>${body}</p>` } };
  },

  async getFaqs(): Promise<ApiResponse<AdminFaqItem[]>> {
    if (!isMock) {
      const res = await apiClient.get('/admin/faqs');
      return { data: res.data?.data || [] };
    }
    await delay(200);
    return { data: [] };
  },

  async createFaq(data: { question: string; answer: string; isActive?: boolean }): Promise<ApiResponse<AdminFaqItem>> {
    if (!isMock) {
      const res = await apiClient.post('/admin/faqs', data);
      return { data: res.data?.data };
    }
    await delay(300);
    return {
      data: {
        id: Date.now(),
        question: data.question,
        answer: data.answer,
        sortOrder: 1,
        isActive: data.isActive !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  },

  async updateFaq(id: number, data: { question?: string; answer?: string; isActive?: boolean }): Promise<ApiResponse<AdminFaqItem>> {
    if (!isMock) {
      const res = await apiClient.put(`/admin/faqs/${id}`, data);
      return { data: res.data?.data };
    }
    await delay(300);
    return {
      data: {
        id,
        question: data.question || '',
        answer: data.answer || '',
        sortOrder: 1,
        isActive: data.isActive !== false,
        updatedAt: new Date().toISOString(),
      },
    };
  },

  async deleteFaq(id: number): Promise<ApiResponse<{ id: number }>> {
    if (!isMock) {
      const res = await apiClient.delete(`/admin/faqs/${id}`);
      return { data: res.data?.data };
    }
    await delay(200);
    return { data: { id } };
  },

  async reorderFaqs(ids: number[]): Promise<ApiResponse<AdminFaqItem[]>> {
    if (!isMock) {
      const res = await apiClient.put('/admin/faqs/reorder', { ids });
      return { data: res.data?.data || [] };
    }
    await delay(200);
    return { data: [] };
  },

  async getBlocks(): Promise<ApiResponse<AdminBlockItem[]>> {
    if (!isMock) {
      const res = await apiClient.get('/admin/content-blocks');
      return { data: res.data?.data || [] };
    }
    await delay(200);
    return { data: [] };
  },

  async updateBlock(key: string, value: any): Promise<ApiResponse<AdminBlockItem>> {
    if (!isMock) {
      const res = await apiClient.put(`/admin/content-blocks/${key}`, { value });
      return { data: res.data?.data };
    }
    await delay(300);
    return {
      data: {
        key,
        value,
        isDefault: false,
        updatedAt: new Date().toISOString(),
      },
    };
  },

  async getPricingRules(): Promise<ApiResponse<AdminPricingRule[]>> {
    if (!isMock) {
      const res = await apiClient.get('/admin/pricing-rules');
      return { data: res.data?.data || [] };
    }
    await delay(200);
    return { data: [] };
  },

  async createPricingRule(payload: Partial<AdminPricingRule>): Promise<ApiResponse<AdminPricingRule>> {
    if (!isMock) {
      const res = await apiClient.post('/admin/pricing-rules', payload);
      return { data: res.data?.data };
    }
    await delay(250);
    return {
      data: {
        id: Date.now(),
        name: payload.name || '',
        ruleType: payload.ruleType || 'custom',
        rateType: payload.rateType || 'fixed',
        rateValue: payload.rateValue || 0,
        scope: payload.scope || 'all',
        priority: payload.priority || 1,
        isActive: payload.isActive !== false,
      } as AdminPricingRule,
    };
  },

  async updatePricingRule(id: number, payload: Partial<AdminPricingRule>): Promise<ApiResponse<AdminPricingRule>> {
    if (!isMock) {
      const res = await apiClient.put(`/admin/pricing-rules/${id}`, payload);
      return { data: res.data?.data };
    }
    await delay(250);
    return {
      data: {
        id,
        ...payload,
      } as AdminPricingRule,
    };
  },

  async deletePricingRule(id: number): Promise<ApiResponse<{ id: number }>> {
    if (!isMock) {
      const res = await apiClient.delete(`/admin/pricing-rules/${id}`);
      return { data: res.data?.data };
    }
    await delay(200);
    return { data: { id } };
  },

  async getDiscountTiers(): Promise<ApiResponse<AdminDiscountTier[]>> {
    if (!isMock) {
      const res = await apiClient.get('/admin/discount-tiers');
      return { data: res.data?.data || [] };
    }
    await delay(200);
    return { data: [] };
  },

  async createDiscountTier(payload: Partial<AdminDiscountTier>): Promise<ApiResponse<AdminDiscountTier>> {
    if (!isMock) {
      const res = await apiClient.post('/admin/discount-tiers', payload);
      return { data: res.data?.data };
    }
    await delay(250);
    return {
      data: {
        id: Date.now(),
        minDays: payload.minDays || 1,
        discountPercent: payload.discountPercent || 0,
        description: payload.description || '',
        isActive: payload.isActive !== false,
      } as AdminDiscountTier,
    };
  },

  async updateDiscountTier(id: number, payload: Partial<AdminDiscountTier>): Promise<ApiResponse<AdminDiscountTier>> {
    if (!isMock) {
      const res = await apiClient.put(`/admin/discount-tiers/${id}`, payload);
      return { data: res.data?.data };
    }
    await delay(250);
    return {
      data: {
        id,
        ...payload,
      } as AdminDiscountTier,
    };
  },

  async deleteDiscountTier(id: number): Promise<ApiResponse<{ id: number }>> {
    if (!isMock) {
      const res = await apiClient.delete(`/admin/discount-tiers/${id}`);
      return { data: res.data?.data };
    }
    await delay(200);
    return { data: { id } };
  },

  // ==========================================
  // GPS TRACKING & TELEMETRY API
  // ==========================================
  async getGpsLive(): Promise<ApiResponse<any>> {
    const res = await apiClient.get('/admin/gps/live');
    return { data: res.data?.data };
  },

  async getMotorcycleGpsPositions(motorcycleId: string | number, query: { from?: string; to?: string } = {}): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get(`/admin/gps/motorcycles/${motorcycleId}/positions${qs}`);
    return { data: res.data?.data };
  },

  async getGpsAlerts(query: Record<string, any> = {}): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get(`/admin/gps/alerts${qs}`);
    return { data: res.data?.data, meta: res.data?.meta };
  },

  async acknowledgeGpsAlert(id: number | string): Promise<ApiResponse<any>> {
    const res = await apiClient.patch(`/admin/gps/alerts/${id}/acknowledge`);
    return { data: res.data?.data };
  },

  async resolveGpsAlert(id: number | string, note: string): Promise<ApiResponse<any>> {
    const res = await apiClient.patch(`/admin/gps/alerts/${id}/resolve`, { note });
    return { data: res.data?.data };
  },

  async getGpsDevices(query: Record<string, any> = {}): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get(`/admin/gps/devices${qs}`);
    return { data: res.data?.data, meta: res.data?.meta };
  },

  async createGpsDevice(payload: any): Promise<ApiResponse<any>> {
    const res = await apiClient.post('/admin/gps/devices', payload);
    return { data: res.data?.data };
  },

  async updateGpsDevice(id: number | string, payload: any): Promise<ApiResponse<any>> {
    const res = await apiClient.put(`/admin/gps/devices/${id}`, payload);
    return { data: res.data?.data };
  },

  async replaceGpsDevice(id: number | string, payload: any): Promise<ApiResponse<any>> {
    const res = await apiClient.post(`/admin/gps/devices/${id}/replace`, payload);
    return { data: res.data?.data };
  },

  async getGpsGeofences(query: Record<string, any> = {}): Promise<ApiResponse<any>> {
    const res = await apiClient.get('/admin/gps/geofences', { params: query });
    return { data: res.data?.data || [] };
  },

  async createGpsGeofence(payload: any): Promise<ApiResponse<any>> {
    const res = await apiClient.post('/admin/gps/geofences', payload);
    return { data: res.data?.data };
  },

  async updateGpsGeofence(id: number | string, payload: any): Promise<ApiResponse<any>> {
    const res = await apiClient.put(`/admin/gps/geofences/${id}`, payload);
    return { data: res.data?.data };
  },

  async deleteGpsGeofence(id: number | string): Promise<ApiResponse<any>> {
    const res = await apiClient.delete(`/admin/gps/geofences/${id}`);
    return { data: res.data?.data };
  },

  async getGpsSettings(): Promise<ApiResponse<any>> {
    const res = await apiClient.get('/admin/gps/settings');
    return { data: res.data?.data };
  },

  async updateGpsSettings(payload: any): Promise<ApiResponse<any>> {
    const res = await apiClient.put('/admin/gps/settings', payload);
    return { data: res.data?.data };
  },

  async getGpsAccessLogs(query: Record<string, any> = {}): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get(`/admin/gps/access-log${qs}`);
    return { data: res.data?.data, meta: res.data?.meta };
  },

  async resetStore(): Promise<void> {
    await delay(300);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CURRENT_ADMIN_KEY);
    }
  },
};
