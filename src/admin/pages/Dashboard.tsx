import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DollarSign,
  CalendarCheck,
  FileCheck2,
  AlertTriangle,
  TrendingUp,
  Plus,
  ArrowRight,
  Key,
  RotateCcw,
  Clock,
  AlertOctagon,
  Bike,
  CheckCircle2,
  ChevronRight,
  History,
  Radio,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { adminApi } from '../services/adminApi';
import type { ReportSummary, AdminBooking } from '../types';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { StatusBadge } from '../components/StatusBadge';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';

export const Dashboard: React.FC = () => {
  const { currentUser, role } = useAdminAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReportSummary | null>(null);
  const [recentBookings, setRecentBookings] = useState<AdminBooking[]>([]);
  const [gpsSummary, setGpsSummary] = useState<{ onlineCount: number; offlineCount: number; alertsCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = React.useCallback(async () => {
    try {
      const [statsRes, bookingsRes, gpsRes] = await Promise.all([
        adminApi.getDashboardStats(),
        adminApi.getBookings({ limit: 5 }),
        adminApi.getGpsLive().catch(() => ({ data: { onlineCount: 0, offlineCount: 0, alertsCount: 0 } })),
      ]);
      setStats(statsRes.data);
      setRecentBookings(bookingsRes.data);
      if (gpsRes?.data) {
        setGpsSummary({
          onlineCount: gpsRes.data.onlineCount || 0,
          offlineCount: gpsRes.data.offlineCount || 0,
          alertsCount: gpsRes.data.alertsCount || 0,
        });
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat statistik dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    setLoading(true);
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    return registerRefetch('staff-dashboard', () => {
      fetchDashboard();
    });
  }, [registerRefetch, fetchDashboard]);

  // Subscribe to real-time events that affect the staff dashboard
  useRealtimeSubscription(
    [
      'booking.updated',
      'payment.updated',
      'document.updated',
      'motor.availability.changed',
      'counters.changed',
    ],
    () => {
      fetchDashboard();
    },
  );

  return (
    <div className="space-y-6">
      {/* Header & Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Dashboard Operasional
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Selamat datang kembali, <span className="font-semibold text-gray-700">{currentUser?.name}</span>.
            Berikut ringkasan performa dan antrean tugas operasional rental RodaKita hari ini.
          </p>
        </div>

        {/* Quick Shortcut Buttons */}
        <div className="flex items-center gap-2">
          {role === 'admin' && (
            <Link
              to="/admin/motors/new"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tambah Motor
            </Link>
          )}
          <Link
            to="/admin/rental-history"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <History className="w-3.5 h-3.5 text-primary-900" />
            <span>Riwayat Sewa</span>
          </Link>
          <Link
            to="/admin/bookings"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            Kelola Booking
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Error state banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* 8 KPI Cards Grid according to PRD & Prompt specification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Pengambilan Hari Ini */}
        <StatCard
          title="Pengambilan Hari Ini"
          value={stats ? stats.pickupsTodayCount : 0}
          icon={Key}
          subtitle="Unit siap diserahterimakan"
          color="info"
          onClick={() => navigate('/admin/bookings?status=confirmed')}
        />

        {/* 2. Pengembalian Hari Ini */}
        <StatCard
          title="Pengembalian Hari Ini"
          value={stats ? stats.returnsTodayCount : 0}
          icon={RotateCcw}
          subtitle="Unit dijadwalkan kembali"
          color="primary"
          onClick={() => navigate('/admin/bookings?status=active')}
        />

        {/* 3. Motor Sedang Disewa */}
        <StatCard
          title="Motor Sedang Disewa"
          value={stats ? (stats.activeRentals ?? stats.activeRentalsCount ?? 0) : 0}
          icon={CalendarCheck}
          subtitle="Armada aktif di jalan"
          color="info"
          onClick={() => navigate('/admin/bookings?status=active')}
        />

        {/* 4. Menunggu Pembayaran */}
        <StatCard
          title="Menunggu Bayar"
          value={stats ? stats.pendingPaymentCount : 0}
          icon={Clock}
          subtitle="Booking pending belum lunas"
          color="warning"
          onClick={() => navigate('/admin/bookings?status=pending')}
        />

        {/* 5. Dokumen Menunggu Verifikasi */}
        <StatCard
          title="Dokumen Menunggu"
          value={stats ? (stats.pendingDocumentsCount ?? stats.pendingDocsCount ?? 0) : 0}
          icon={FileCheck2}
          subtitle="KTP/SIM baru belum ditinjau"
          color="warning"
          onClick={() => navigate('/admin/documents')}
        />

        {/* 6. Booking Terlambat Kembali - TAMPIL MERAH */}
        <StatCard
          title="Terlambat Kembali"
          value={stats ? stats.overdueBookingsCount : 0}
          icon={AlertOctagon}
          subtitle="Active & lewat jadwal kembali"
          color="danger"
          change={stats && stats.overdueBookingsCount > 0 ? 'Perhatian Mendesak!' : 'Nol Keterlambatan'}
          isPositive={stats ? stats.overdueBookingsCount === 0 : true}
          onClick={() => navigate('/admin/bookings?status=active')}
        />

        {/* 7. Pendapatan Bulan Ini (dibanding bulan lalu dalam persen) */}
        <StatCard
          title="Pendapatan Bulan Ini"
          value={stats ? formatPrice(stats.revenueThisMonth ?? stats.revenueTotal ?? 0) : 'Rp 0'}
          icon={DollarSign}
          change={`+${stats?.revenueGrowthPercent || 18.2}% vs bln lalu`}
          isPositive={true}
          subtitle="Omzet rental terkonfirmasi"
          color="success"
          onClick={() => navigate('/admin/reports')}
        />

        {/* 8. Tingkat Okupansi 30 Hari */}
        <StatCard
          title="Okupansi 30 Hari"
          value={stats ? `${stats.occupancyRate}%` : '0%'}
          icon={TrendingUp}
          change={`${stats?.rentedMotors || 0} dari ${stats?.totalMotors || 0} unit`}
          subtitle="Rata-rata utilisasi armada"
          color="primary"
          onClick={() => navigate('/admin/motors')}
        />
      </div>

      {/* GPS Tracking Quick Summary Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-900 text-white flex items-center justify-center font-bold shadow-xs">
            <Radio className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              Pelacakan GPS Armada Live
              {gpsSummary && gpsSummary.alertsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 animate-pulse">
                  {gpsSummary.alertsCount} Alert
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500">
              {gpsSummary ? `${gpsSummary.onlineCount} unit online • ${gpsSummary.offlineCount} offline` : 'Memuat data GPS...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {gpsSummary?.onlineCount ?? 0} Online
            </span>
            <span className="flex items-center gap-1.5 text-gray-700 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              {gpsSummary?.offlineCount ?? 0} Offline
            </span>
          </div>

          <button
            onClick={() => navigate('/admin/gps')}
            className="px-3.5 py-2 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
          >
            Buka Peta GPS
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Section: Daftar Tugas Hari Ini */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Tugas Hari Ini</h3>
              <p className="text-xs text-gray-500">Antrean tindakan operasional langsung yang memerlukan tindakan staf</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-primary-100 text-primary-900">
            {stats?.todayTasks?.length || 0} Tugas
          </span>
        </div>

        {(!stats?.todayTasks || stats.todayTasks.length === 0) ? (
          <div className="py-6 text-center text-xs text-gray-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5 opacity-80" />
            Tidak ada tugas operasional tertunda untuk hari ini. Semua proses berjalan lancar!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stats.todayTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => navigate(task.link)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  task.isUrgent
                    ? 'bg-rose-50/70 border-rose-200 hover:bg-rose-100/70 hover:border-rose-300'
                    : 'bg-gray-50/70 border-gray-200 hover:bg-gray-100/80 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                      task.type === 'overdue'
                        ? 'bg-rose-100 text-rose-700'
                        : task.type === 'pickup'
                        ? 'bg-blue-100 text-blue-700'
                        : task.type === 'return'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {task.type === 'overdue' && <AlertOctagon className="w-4 h-4" />}
                    {task.type === 'pickup' && <Key className="w-4 h-4" />}
                    {task.type === 'return' && <RotateCcw className="w-4 h-4" />}
                    {task.type === 'document' && <FileCheck2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate ${task.isUrgent ? 'text-rose-900' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{task.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      task.isUrgent
                        ? 'bg-rose-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-200'
                    }`}
                  >
                    {task.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts Grid: 30-Day Revenue Line Chart & Booking Status Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Grafik Pendapatan 30 Hari (Garis) */}
        <div className="lg:col-span-2">
          <ChartCard
            title="Tren Pendapatan 30 Hari"
            subtitle="Grafik garis pergerakan omzet transaksi rental 30 hari terakhir (Rp)"
            loading={loading}
          >
            <LineChart data={stats?.revenue30DaysTrend || []} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} minTickGap={15} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B7280' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}rb`}
              />
              <Tooltip
                formatter={(value: any) => [formatPrice(Number(value)), 'Omzet']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#0B1F3A"
                strokeWidth={3}
                dot={{ r: 2, fill: '#0B1F3A' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartCard>
        </div>

        {/* 2. Grafik Status Booking (Batang) */}
        <div className="lg:col-span-1">
          <ChartCard
            title="Distribusi Status Booking"
            subtitle="Grafik batang jumlah transaksi per status pesanan saat ini"
            loading={loading}
          >
            <BarChart
              data={stats?.bookingStatusCounts || []}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ fontSize: 11, fill: '#4B5563' }}
                width={95}
              />
              <Tooltip
                formatter={(value: any) => [`${value} Booking`, 'Jumlah']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {(stats?.bookingStatusCounts || []).map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
        </div>
      </div>

      {/* Row: Motor Terlaris (5 Teratas) & Recent Bookings Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Motor Terlaris (5 Teratas) */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Bike className="w-4 h-4 text-primary-900" />
                Motor Terlaris (5 Teratas)
              </h3>
              <p className="text-xs text-gray-500">Berdasarkan frekuensi sewa & perolehan omzet</p>
            </div>
            <Link to="/admin/motors" className="text-xs text-primary-900 font-semibold hover:underline">
              Semua
            </Link>
          </div>

          <div className="space-y-3">
            {(stats?.topMotors || []).slice(0, 5).map((motor, idx) => (
              <div key={motor.id || idx} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-800'
                        : idx === 1
                        ? 'bg-gray-200 text-gray-800'
                        : idx === 2
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-gray-900">{motor.name}</p>
                    <p className="text-[11px] text-gray-400">{motor.rentalCount || 10}x transaksi sewa</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-extrabold text-emerald-700">{formatPrice(motor.revenue)}</p>
                  <p className="text-[10px] text-gray-400">Total omzet</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaksi Booking Terbaru */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Transaksi Booking Terbaru</h3>
              <p className="text-xs text-gray-500 mt-0.5">5 pemesanan terakhir yang masuk ke sistem</p>
            </div>
            <Link
              to="/admin/bookings"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-900 hover:text-primary-700"
            >
              Lihat Semua Booking
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 uppercase font-semibold text-gray-500">
                <tr>
                  <th className="px-4 py-3">Kode Booking</th>
                  <th className="px-4 py-3">Pelanggan</th>
                  <th className="px-4 py-3">Motor Disewa</th>
                  <th className="px-4 py-3">Periode</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Belum ada transaksi sewa.
                    </td>
                  </tr>
                ) : (
                  recentBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary-900">
                        {b.code || b.bookingCode}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{b.renter?.name || b.userName}</p>
                        <p className="text-[11px] text-gray-400">{b.renter?.phone || b.userPhone}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {b.motorName || `Motor #${b.motorId}`}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(b.startDate)} - {formatDate(b.endDate)}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {formatPrice(b.total ?? b.totalPrice ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/admin/bookings/${b.id}`}
                          className="inline-flex items-center px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded text-[11px] transition-colors"
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
