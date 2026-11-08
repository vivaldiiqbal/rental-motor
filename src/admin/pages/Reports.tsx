import React, { useEffect, useState, useMemo } from 'react';
import {
  DollarSign,
  CalendarCheck,
  Bike,
  Award,
  Info,
  Clock,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { adminApi } from '../services/adminApi';
import type { ReportSummary, AdminBooking } from '../types';
import type { Motor } from '../../types';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { CsvButton } from '../components/CsvButton';
import { formatPrice } from '../../utils/formatPrice';
import {
  calculateBookingRevenue,
  formatGrowthPercentage,
  formatYAxisRevenue,
} from '../utils/revenue';

import { usePermission } from '../hooks/usePermission';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export const Reports: React.FC = () => {
  const { role } = usePermission();
  const [stats, setStats] = useState<ReportSummary | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [motors, setMotors] = useState<Motor[]>([]);
  const [loading, setLoading] = useState(true);

  // Date Range and Grouping State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupBy, setGroupBy] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  useEffect(() => {
    let mounted = true;
    const fetchReports = async () => {
      setLoading(true);
      try {
        const [statsRes, bookingsRes, motorsRes] = await Promise.all([
          adminApi.getDashboardStats(),
          adminApi.getBookings({ limit: 150, startDate: startDate || undefined, endDate: endDate || undefined }),
          adminApi.getMotors({ limit: 50 }),
        ]);
        if (mounted) {
          setStats(statsRes.data);
          setBookings(bookingsRes.data);
          setMotors(motorsRes.data);
        }
      } catch {
        // silent
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchReports();
    return () => {
      mounted = false;
    };
  }, [startDate, endDate, groupBy]);

  // Status breakdown
  const statusCounts = useMemo(() => {
    const counts = { pending: 0, confirmed: 0, active: 0, completed: 0, cancelled: 0 };
    bookings.forEach((b) => {
      if (counts[b.status as keyof typeof counts] !== undefined) {
        counts[b.status as keyof typeof counts]++;
      }
    });
    return [
      { status: 'Menunggu', count: counts.pending, color: '#F59E0B' },
      { status: 'Dikonfirmasi', count: counts.confirmed, color: '#3B82F6' },
      { status: 'Aktif Sewa', count: counts.active, color: '#10B981' },
      { status: 'Selesai', count: counts.completed, color: '#0B1F3A' },
      { status: 'Dibatalkan', count: counts.cancelled, color: '#EF4444' },
    ];
  }, [bookings]);

  // Aggregate motor performance & occupancy (Single Source of Truth)
  const motorPerformance = useMemo(() => {
    const map: Record<
      string,
      {
        id: string;
        name: string;
        plate: string;
        count: number;
        totalDays: number;
        motorRentalRevenue: number;
        otherRevenue: number;
        revenue: number;
      }
    > = {};

    motors.forEach((m) => {
      map[m.id] = {
        id: m.id,
        name: m.name,
        plate: m.plate || '-',
        count: 0,
        totalDays: 0,
        motorRentalRevenue: 0,
        otherRevenue: 0,
        revenue: 0,
      };
    });

    bookings.forEach((b) => {
      const motorId = b.motorId;
      if (!map[motorId]) {
        map[motorId] = {
          id: motorId,
          name: b.motorName || `Motor #${motorId}`,
          plate: '-',
          count: 0,
          totalDays: 0,
          motorRentalRevenue: 0,
          otherRevenue: 0,
          revenue: 0,
        };
      }
      map[motorId].count += 1;

      const dur = Math.max(
        1,
        Math.ceil(
          (new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      map[motorId].totalDays += dur;

      // Definisi Pendapatan: confirmed/active/completed minus refund plus add-ons & denda (Deposit tidak dihitung)
      if (['confirmed', 'active', 'completed'].includes(b.status)) {
        const itemRev = calculateBookingRevenue(b);
        map[motorId].motorRentalRevenue += itemRev.motorRentalRevenue;
        map[motorId].otherRevenue += itemRev.otherRevenue;
        map[motorId].revenue += itemRev.totalNetRevenue;
      }
    });

    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [motors, bookings]);

  // Total Verified Revenue Summary (Sewa Motor vs Lainnya vs Bersih)
  const totalRevSummary = useMemo(() => {
    return motorPerformance.reduce(
      (acc, m) => {
        acc.motorRentalRevenue += m.motorRentalRevenue;
        acc.otherRevenue += m.otherRevenue;
        acc.totalNetRevenue += m.revenue;
        return acc;
      },
      { motorRentalRevenue: 0, otherRevenue: 0, totalNetRevenue: 0 }
    );
  }, [motorPerformance]);

  // Persentase pertumbuhan dinamis (% vs bln lalu)
  const growth = useMemo(() => {
    const cur = totalRevSummary.totalNetRevenue;
    const prev = stats?.prevMonthRevenue ?? stats?.revenueLastMonth ?? 0;
    return formatGrowthPercentage(cur, prev);
  }, [totalRevSummary.totalNetRevenue, stats]);

  // Sinkronisasi data grafik Tren Pertumbuhan Pendapatan (Bulanan)
  const chartData = useMemo(() => {
    if (stats?.monthlyRevenue && stats.monthlyRevenue.length > 0) {
      return stats.monthlyRevenue.map((item) => {
        if (item.month === 'Bulan Ini') {
          return { ...item, revenue: totalRevSummary.totalNetRevenue };
        }
        return item;
      });
    }
    return [{ month: 'Bulan Ini', revenue: totalRevSummary.totalNetRevenue }];
  }, [stats?.monthlyRevenue, totalRevSummary.totalNetRevenue]);

  // Average duration
  const avgDuration = useMemo(() => {
    if (bookings.length === 0) return 0;
    const totalDays = bookings.reduce((acc, b) => {
      const dur = Math.max(
        1,
        Math.ceil(
          (new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      return acc + dur;
    }, 0);
    return (totalDays / bookings.length).toFixed(1);
  }, [bookings]);

  if (role !== 'admin') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-lg mx-auto mt-10">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900">Tidak Punya Akses</h2>
        <p className="text-xs text-gray-500 mt-1">
          Halaman Laporan Keuangan hanya dapat diakses oleh Administrator utama. Peran Anda saat ini adalah Staff.
        </p>
        <Link
          to="/admin"
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary-900 text-white text-xs font-semibold rounded-lg hover:bg-primary-800"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Range and Grouping */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Laporan & Analitik Keuangan</h1>
          <p className="text-xs text-gray-500 mt-1">
            Analisis pendapatan bersih, utilisasi per unit motor, durasi sewa, dan distribusi status pemesanan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Grouping Dropdown */}
          <div className="flex items-center bg-white border border-gray-300 rounded-xl p-1 shadow-xs">
            <span className="text-[10px] font-bold text-gray-400 px-2 uppercase">Grup:</span>
            {(['daily', 'weekly', 'monthly'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  groupBy === g
                    ? 'bg-primary-900 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {g === 'daily' ? 'Harian' : g === 'weekly' ? 'Mingguan' : 'Bulanan'}
              </button>
            ))}
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-xl px-2.5 py-1 shadow-xs text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs text-gray-700 bg-transparent focus:outline-none"
              title="Dari Tanggal"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs text-gray-700 bg-transparent focus:outline-none"
              title="Sampai Tanggal"
            />
          </div>

          <CsvButton
            data={motorPerformance}
            columns={[
              { header: 'Unit Motor', accessor: (m) => m.name },
              { header: 'Plat Nomor', accessor: (m) => m.plate },
              { header: 'Frekuensi Sewa', accessor: (m) => m.count },
              { header: 'Total Hari Tersewa', accessor: (m) => m.totalDays },
              { header: 'Sewa Motor Pokok (Rp)', accessor: (m) => m.motorRentalRevenue },
              { header: 'Pendapatan Lainnya (Rp)', accessor: (m) => m.otherRevenue },
              { header: 'Total Pendapatan Bersih (Rp)', accessor: (m) => m.revenue },
            ]}
            filename={`laporan-rental-${groupBy}-${new Date().toISOString().split('T')[0]}.csv`}
            label="Ekspor CSV"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Pendapatan Bersih"
          value={formatPrice(totalRevSummary.totalNetRevenue)}
          icon={DollarSign}
          change={growth.text}
          isPositive={growth.isPositive}
          subtitle={
            <div className="mt-1 space-y-0.5 text-xs text-gray-500 font-medium">
              <div>
                Sewa Motor: <span className="font-semibold text-gray-700">{formatPrice(totalRevSummary.motorRentalRevenue)}</span>
              </div>
              <div>
                Pendapatan Lainnya (Layanan & Denda):{' '}
                <span className="font-semibold text-gray-700">{formatPrice(totalRevSummary.otherRevenue)}</span>
              </div>
            </div>
          }
          color="success"
        />
        <StatCard
          title="Rata-rata Durasi Sewa"
          value={`${avgDuration} Hari`}
          icon={Clock}
          subtitle="Rata-rata waktu pemakaian per sewa"
          color="primary"
        />
        <StatCard
          title="Total Pemesanan Terdata"
          value={bookings.length}
          icon={CalendarCheck}
          subtitle="Semua status dalam rentang waktu"
          color="info"
        />
        <StatCard
          title="Tingkat Okupansi Armada"
          value={stats ? `${stats.occupancyRate}%` : '74.5%'}
          icon={Bike}
          subtitle="Rasio utilisasi 30 hari terakhir"
          color="warning"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Area Chart */}
        <ChartCard
          title={`Tren Pertumbuhan Pendapatan (${groupBy === 'daily' ? 'Harian' : groupBy === 'weekly' ? 'Mingguan' : 'Bulanan'})`}
          subtitle="Grafik historis omzet sewa bersih RodaKita"
          loading={loading}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevRep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0B1F3A" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#0B1F3A" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickFormatter={formatYAxisRevenue}
                />
                <Tooltip
                  formatter={(value: any) => [formatPrice(Number(value)), 'Pendapatan']}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0B1F3A"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRevRep)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Status Breakdown Bar Chart */}
        <ChartCard
          title="Distribusi Jumlah Booking per Status"
          subtitle="Sebaran transaksi pending, confirmed, active, completed, cancelled"
          loading={loading}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusCounts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#374151' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                <Tooltip
                  formatter={(val: any) => [`${val} Transaksi`, 'Jumlah']}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#0B1F3A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Mandatory Revenue Definition Note Below Charts */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-800 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-950 leading-relaxed">
          <strong className="font-bold">Definisi Pendapatan Bersih:</strong>{' '}
          Total tarif sewa motor ditambah layanan tambahan & denda (keterlambatan/kerusakan) dikurangi refund dari pesanan berstatus{' '}
          <span className="font-semibold text-blue-900">Dikonfirmasi</span>,{' '}
          <span className="font-semibold text-blue-900">Aktif Sewa</span>, dan{' '}
          <span className="font-semibold text-blue-900">Selesai</span>.{' '}
          <span className="font-bold underline text-blue-900">UANG DEPOSIT TIDAK DIHITUNG SEBAGAI PENDAPATAN</span>{' '}
          karena merupakan dana titipan jaminan yang dikembalikan kepada penyewa.
        </div>
      </div>

      {/* Motor Performance Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-gray-900">
              Performa Okupansi & Kontribusi Omzet per Unit Motor
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 uppercase font-semibold text-gray-500">
              <tr>
                <th className="px-4 py-3">Peringkat</th>
                <th className="px-4 py-3">Unit Motor</th>
                <th className="px-4 py-3">Plat Nomor</th>
                <th className="px-4 py-3 text-center">Frekuensi Sewa</th>
                <th className="px-4 py-3 text-center">Hari Tersewa</th>
                <th className="px-4 py-3 text-right">Sewa Motor Pokok</th>
                <th className="px-4 py-3 text-right">Layanan & Denda</th>
                <th className="px-4 py-3 text-right">Total Pendapatan Bersih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {motorPerformance.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50/70">
                  <td className="px-4 py-3 font-bold text-gray-400">#{idx + 1}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-600">{item.plate}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">
                    {item.count} Kali
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">
                    {item.totalDays} Hari
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700">
                    {formatPrice(item.motorRentalRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700">
                    {formatPrice(item.otherRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">
                    {formatPrice(item.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Reports;
