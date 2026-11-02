import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  History,
  Bike,
  Calendar,
  DollarSign,
  Search,
  RotateCcw,
  ExternalLink,
  Gauge,
  Fuel,
  User,
  Phone,
  ArrowRight,
  Download,
  CalendarDays,
  Edit2,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import type { AdminBooking } from '../types';
import type { Motor } from '../../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';

export const RentalHistory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { registerRefetch } = useRealtime();

  const motorIdParam = searchParams.get('motorId') || 'all';

  const [motors, setMotors] = useState<Motor[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedMotorId, setSelectedMotorId] = useState<string>(motorIdParam);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  // Sinkronisasi URL query param saat motor dipilih
  const handleMotorChange = (id: string) => {
    setSelectedMotorId(id);
    const newParams = new URLSearchParams(searchParams);
    if (id === 'all') {
      newParams.delete('motorId');
    } else {
      newParams.set('motorId', id);
    }
    setSearchParams(newParams);
  };

  // Muat daftar motor armada
  useEffect(() => {
    let mounted = true;
    const fetchMotors = async () => {
      try {
        const res = await adminApi.getMotors({ limit: 100 });
        if (mounted) {
          setMotors(res.data);
        }
      } catch (err: any) {
        console.warn('Gagal memuat daftar motor:', err);
      }
    };
    fetchMotors();
    return () => {
      mounted = false;
    };
  }, []);

  // Muat data histori penyewaan
  const fetchRentalHistory = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const params: any = { limit: 1000 };
        if (selectedMotorId !== 'all') {
          params.motorId = selectedMotorId;
        }

        const res = await adminApi.getBookings(params);
        setBookings(res.data);
      } catch (err: any) {
        setError(err.message || 'Gagal memuat riwayat penyewaan armada.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedMotorId],
  );

  useEffect(() => {
    fetchRentalHistory();
  }, [fetchRentalHistory]);

  // Real-time synchronization saat ada status sewa berubah
  useRealtimeSubscription(
    ['booking.updated', 'motor.availability.changed', 'payment.updated'],
    () => {
      fetchRentalHistory(true);
    },
  );

  useEffect(() => {
    registerRefetch('admin-rental-history', () => fetchRentalHistory(true));
  }, [fetchRentalHistory]);

  // Cari data motor yang sedang dipilih jika spesifik
  const selectedMotor = useMemo(() => {
    if (selectedMotorId === 'all') return null;
    return motors.find((m) => String(m.id) === String(selectedMotorId)) || null;
  }, [selectedMotorId, motors]);

  // Filter booking berdasarkan kriteria pencarian dan tanggal
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Filter Motor
      if (selectedMotorId !== 'all') {
        const bMotorId = String(b.motorId || (b as any).motorcycleId || (b as any).motor?.id || '');
        if (bMotorId !== String(selectedMotorId)) return false;
      }

      // Filter Status
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }

      // Filter Search (Kode, Renter, Telepon, Plat)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = (b.bookingCode || b.code || '').toLowerCase();
        const renter = (b.userName || b.renter?.name || '').toLowerCase();
        const phone = (b.userPhone || b.renter?.phone || '').toLowerCase();
        const motorName = (b.motorName || (b as any).motor?.name || '').toLowerCase();
        const plate = (b.motorPlate || (b as any).motor?.plate || '').toLowerCase();
        if (
          !code.includes(q) &&
          !renter.includes(q) &&
          !phone.includes(q) &&
          !motorName.includes(q) &&
          !plate.includes(q)
        ) {
          return false;
        }
      }

      // Filter Tanggal Mulai
      if (startDateFilter && b.startDate) {
        if (new Date(b.startDate) < new Date(startDateFilter)) return false;
      }

      // Filter Tanggal Selesai
      if (endDateFilter && b.endDate) {
        if (new Date(b.endDate) > new Date(endDateFilter)) return false;
      }

      return true;
    });
  }, [bookings, selectedMotorId, statusFilter, searchQuery, startDateFilter, endDateFilter]);

  // Statistik agregasi
  const stats = useMemo(() => {
    const totalTransactions = filteredBookings.length;
    const completedList = filteredBookings.filter((b) => b.status === 'completed');
    const activeList = filteredBookings.filter((b) => b.status === 'active');
    const confirmedList = filteredBookings.filter((b) => b.status === 'confirmed');
    const cancelledList = filteredBookings.filter((b) => b.status === 'cancelled');

    // Total omzet dari transaksi aktif / selesai / terkonfirmasi
    const totalRevenue = filteredBookings
      .filter((b) => ['confirmed', 'active', 'completed'].includes(b.status))
      .reduce((sum, b) => {
        const rental = b.totalPrice ?? b.total ?? 0;
        const refund = b.refundAmount ?? 0;
        const extra = (b.lateFee ?? 0) + (b.damageFee ?? 0) + (b.otherFee ?? 0);
        return sum + Math.max(0, rental - refund + extra);
      }, 0);

    // Total hari tersewa
    let totalRentedDays = 0;
    completedList.forEach((b) => {
      if (b.startDate && b.endDate) {
        const d1 = new Date(b.startDate).getTime();
        const d2 = new Date(b.endDate).getTime();
        const days = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
        totalRentedDays += days;
      }
    });

    // Total KM yang ditempuh (selisih odometer pengembalian - serah terima)
    let totalKilometers = 0;
    completedList.forEach((b) => {
      const startKm = b.startOdometer ?? b.handover?.startOdometer;
      const endKm = b.endOdometer ?? b.returnInfo?.endOdometer;
      if (startKm !== undefined && endKm !== undefined && endKm >= startKm) {
        totalKilometers += endKm - startKm;
      }
    });

    return {
      totalTransactions,
      completedCount: completedList.length,
      activeCount: activeList.length,
      confirmedCount: confirmedList.length,
      cancelledCount: cancelledList.length,
      totalRevenue,
      totalRentedDays,
      totalKilometers,
    };
  }, [filteredBookings]);

  // Reset semua filter
  const handleResetFilters = () => {
    setSelectedMotorId('all');
    setStatusFilter('all');
    setSearchQuery('');
    setStartDateFilter('');
    setEndDateFilter('');
    setSearchParams({});
  };

  // Ekspor CSV dari baris yang difilter
  const handleExportCsv = () => {
    const headers = [
      'Kode Booking',
      'Plat Nomor',
      'Motor',
      'Nama Penyewa',
      'No Telepon',
      'Tanggal Mulai',
      'Tanggal Selesai',
      'Status Booking',
      'Status Bayar',
      'Total Sewa (Rp)',
      'KM Awal',
      'KM Akhir',
      'Selisih KM',
    ];

    const rows = filteredBookings.map((b) => {
      const startKm = b.startOdometer ?? b.handover?.startOdometer ?? '';
      const endKm = b.endOdometer ?? b.returnInfo?.endOdometer ?? '';
      const diffKm =
        typeof startKm === 'number' && typeof endKm === 'number' && endKm >= startKm
          ? endKm - startKm
          : '';

      return [
        `"${b.bookingCode || b.code}"`,
        `"${b.motorPlate || (b as any).motor?.plate || '-'}"`,
        `"${b.motorName || (b as any).motor?.name || '-'}"`,
        `"${b.userName || b.renter?.name || '-'}"`,
        `"${b.userPhone || b.renter?.phone || '-'}"`,
        `"${b.startDate || '-'}"`,
        `"${b.endDate || '-'}"`,
        `"${b.status}"`,
        `"${b.paymentStatus || '-'}"`,
        `"${b.totalPrice ?? b.total ?? 0}"`,
        `"${startKm}"`,
        `"${endKm}"`,
        `"${diffKm}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `riwayat-sewa-motor-${selectedMotorId !== 'all' ? selectedMotorId : 'semua'}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary-100 text-primary-900 rounded-xl">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                Riwayat Sewa Motor
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Log komprehensif histori pemesanan, pemakaian armada, jarak tempuh, bensin, dan
                performa finansial per unit motor.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchRentalHistory(false)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredBookings.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary-900 text-white hover:bg-primary-800 text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* Spotlight Card Unit Motor Terpilih */}
      {selectedMotor && (
        <div className="bg-gradient-to-r from-primary-900 via-primary-800 to-indigo-900 rounded-2xl text-white p-5 sm:p-6 shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 pointer-events-none transform skew-x-12" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white/10 border border-white/20 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {selectedMotor.images && selectedMotor.images[0] ? (
                  <img
                    src={selectedMotor.images[0]}
                    alt={selectedMotor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bike className="w-10 h-10 text-white/50" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-1 rounded-md bg-white/20 text-white font-mono font-black text-xs tracking-wider border border-white/20">
                    {selectedMotor.plate || (selectedMotor as any).plateNumber || 'Plat Tidak Ada'}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                    {selectedMotor.brand}
                  </span>
                  <StatusBadge status={selectedMotor.status} size="sm" />
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                  {selectedMotor.name}
                </h2>

                <div className="flex items-center gap-3 text-xs text-primary-200 mt-1 flex-wrap">
                  <span>{selectedMotor.cc} CC</span>
                  <span>•</span>
                  <span className="capitalize">{selectedMotor.transmission}</span>
                  <span>•</span>
                  <span>Tahun {selectedMotor.year}</span>
                  <span>•</span>
                  <span>{formatPrice(selectedMotor.pricePerDay)} / hari</span>
                </div>
              </div>
            </div>

            {/* Quick Actions Terkoneksi */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleMotorChange('all')}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors border border-white/20"
              >
                Lihat Semua Armada
              </button>

              <Link
                to={`/admin/motors/${selectedMotor.id}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-primary-900 hover:bg-gray-100 text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-primary-900" />
                <span>Edit Data Motor</span>
              </Link>

              <Link
                to="/admin/calendar"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors border border-white/20"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Kalender Sewa</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KPI Ringkasan Metrik */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Total Disewa
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Bike className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 mt-2">
            {stats.totalTransactions}
            <span className="text-xs font-semibold text-gray-400 ml-1">transaksi</span>
          </p>
          <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
            <span className="text-emerald-700 font-semibold">{stats.completedCount} selesai</span>
            <span>•</span>
            <span className="text-blue-700 font-semibold">{stats.activeCount} berjalan</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Total Omzet Dihasilkan
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 mt-2">
            {formatPrice(stats.totalRevenue)}
          </p>
          <p className="text-[10px] text-gray-500 mt-1">
            Akumulasi nilai sewa bersih + denda unit
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Hari Tersewa
            </span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 mt-2">
            {stats.totalRentedDays}
            <span className="text-xs font-semibold text-gray-400 ml-1">hari total</span>
          </p>
          <p className="text-[10px] text-gray-500 mt-1">
            Dari seluruh transaksi sewa yang berhasil
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Jarak Tempuh Dicatat
            </span>
            <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 mt-2">
            {stats.totalKilometers > 0 ? stats.totalKilometers.toLocaleString('id-ID') : 0}
            <span className="text-xs font-semibold text-gray-400 ml-1">KM</span>
          </p>
          <p className="text-[10px] text-gray-500 mt-1">
            Total selisih odometer serah/kembali
          </p>
        </div>
      </div>

      {/* Bar Filter & Pencarian Lengkap */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Pilih Motor */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              Filter Motor Armada
            </label>
            <div className="relative">
              <Bike className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedMotorId}
                onChange={(e) => handleMotorChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:border-primary-900 focus:ring-1 focus:ring-primary-900 transition-all outline-hidden"
              >
                <option value="all">Semua Armada Motor ({motors.length} Unit)</option>
                {motors.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.plate || (m as any).plateNumber || 'No Plat'}] {m.name} ({m.brand})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Input */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              Cari Transaksi / Penyewa
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari kode booking, nama penyewa, no HP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:border-primary-900 focus:ring-1 focus:ring-primary-900 transition-all outline-hidden"
              />
            </div>
          </div>

          {/* Rentang Tanggal Mulai & Selesai */}
          <div className="md:col-span-4 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-primary-900 outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-primary-900 outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Tab Status Filter */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'all', label: 'Semua Status', count: bookings.length },
              {
                id: 'completed',
                label: 'Selesai',
                count: bookings.filter((b) => b.status === 'completed').length,
              },
              {
                id: 'active',
                label: 'Sedang Disewa',
                count: bookings.filter((b) => b.status === 'active').length,
              },
              {
                id: 'confirmed',
                label: 'Terkonfirmasi',
                count: bookings.filter((b) => b.status === 'confirmed').length,
              },
              {
                id: 'cancelled',
                label: 'Dibatalkan',
                count: bookings.filter((b) => b.status === 'cancelled').length,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-primary-900 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    statusFilter === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-white text-gray-700 border border-gray-200'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {(selectedMotorId !== 'all' ||
            statusFilter !== 'all' ||
            searchQuery ||
            startDateFilter ||
            endDateFilter) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabel Riwayat Penyewaan Interkoneksi */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-900" />
            <h3 className="text-sm font-bold text-gray-900">
              Daftar Log Penyewaan
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
              {filteredBookings.length} Log
            </span>
          </div>

          <div className="text-xs text-gray-400">
            Urutan: Transaksi terbaru
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-primary-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-500 mt-3 font-medium">Memuat riwayat armada...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-xs">{error}</div>
        ) : filteredBookings.length === 0 ? (
          <div className="p-12 text-center max-w-sm mx-auto">
            <Bike className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-800">Tidak ada riwayat penyewaan</p>
            <p className="text-xs text-gray-500 mt-1">
              Tidak ada catatan rental yang cocok dengan filter atau kriteria pencarian yang Anda pilih.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200"
            >
              Reset Semua Filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50/80 border-b border-gray-200 uppercase font-bold text-[11px] text-gray-500">
                <tr>
                  <th className="px-4 py-3.5">Kode Booking</th>
                  <th className="px-4 py-3.5">Unit Motor</th>
                  <th className="px-4 py-3.5">Penyewa</th>
                  <th className="px-4 py-3.5">Periode Sewa</th>
                  <th className="px-4 py-3.5">Serah Terima</th>
                  <th className="px-4 py-3.5">Pengembalian</th>
                  <th className="px-4 py-3.5">Total & Deposit</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBookings.map((b) => {
                  const startKm = b.startOdometer ?? b.handover?.startOdometer;
                  const endKm = b.endOdometer ?? b.returnInfo?.endOdometer;
                  const diffKm =
                    typeof startKm === 'number' && typeof endKm === 'number' && endKm >= startKm
                      ? endKm - startKm
                      : null;

                  const startFuel = b.startFuelLevel ?? b.handover?.initialFuel;
                  const endFuel = b.endFuelLevel ?? b.returnInfo?.finalFuel;

                  const bookingMotorId = String(
                    b.motorId || (b as any).motorcycleId || (b as any).motor?.id || '',
                  );

                  return (
                    <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Kode Booking */}
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/admin/bookings/${b.id}`}
                          className="font-mono font-bold text-primary-900 hover:underline flex items-center gap-1 group"
                        >
                          <span>{b.bookingCode || b.code}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          Dibuat: {formatDate(b.createdAt)}
                        </span>
                      </td>

                      {/* Motor & Plat */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMotorChange(bookingMotorId)}
                            title="Filter hanya unit ini"
                            className="font-bold text-gray-900 hover:text-primary-900 text-left transition-colors"
                          >
                            {b.motorName || (b as any).motor?.name || 'Unit Motor'}
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-1.5 py-0.5 rounded-sm bg-gray-100 text-gray-800 font-mono text-[10px] font-bold border border-gray-200">
                            {b.motorPlate || (b as any).motor?.plate || '-'}
                          </span>
                          {bookingMotorId && (
                            <Link
                              to={`/admin/motors/${bookingMotorId}/edit`}
                              className="text-[10px] text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              Detail Motor &rarr;
                            </Link>
                          )}
                        </div>
                      </td>

                      {/* Penyewa & Kontak */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900">
                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span>{b.userName || b.renter?.name || 'Penyewa'}</span>
                        </div>
                        {(b.userPhone || b.renter?.phone) && (
                          <a
                            href={`https://wa.me/${(b.userPhone || b.renter?.phone || '').replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-gray-500 hover:text-emerald-700 flex items-center gap-1 mt-0.5"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            <span>{b.userPhone || b.renter?.phone}</span>
                          </a>
                        )}
                        {b.userId && (
                          <Link
                            to={`/admin/users/${b.userId}`}
                            className="text-[10px] text-primary-900 hover:underline block mt-0.5"
                          >
                            Lihat Profil Akun &rarr;
                          </Link>
                        )}
                      </td>

                      {/* Periode Sewa */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="text-gray-900 font-medium">
                          {formatDate(b.startDate)}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          s/d {formatDate(b.endDate)}
                        </div>
                        {b.startDate && b.endDate && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded-sm bg-blue-50 text-blue-700 text-[10px] font-bold">
                            {Math.max(
                              1,
                              Math.ceil(
                                (new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) /
                                  (1000 * 60 * 60 * 24),
                              ),
                            )}{' '}
                            hari
                          </span>
                        )}
                      </td>

                      {/* Kondisi Serah Terima */}
                      <td className="px-4 py-3.5">
                        {startKm !== undefined ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 font-mono font-semibold text-gray-800">
                              <Gauge className="w-3 h-3 text-gray-400" />
                              <span>{startKm.toLocaleString('id-ID')} KM</span>
                            </div>
                            {startFuel && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                <Fuel className="w-2.5 h-2.5 text-gray-400" />
                                <span>Bensin: {startFuel}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Belum serah terima</span>
                        )}
                      </td>

                      {/* Kondisi Pengembalian */}
                      <td className="px-4 py-3.5">
                        {endKm !== undefined ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 font-mono font-semibold text-gray-800">
                              <Gauge className="w-3 h-3 text-gray-400" />
                              <span>{endKm.toLocaleString('id-ID')} KM</span>
                            </div>
                            {diffKm !== null && (
                              <span className="inline-block px-1.5 py-0.2 rounded-sm bg-purple-50 text-purple-700 text-[10px] font-bold">
                                +{diffKm.toLocaleString('id-ID')} KM
                              </span>
                            )}
                            {endFuel && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                <Fuel className="w-2.5 h-2.5 text-gray-400" />
                                <span>Bensin: {endFuel}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Belum kembali</span>
                        )}
                      </td>

                      {/* Finansial */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-bold text-gray-900">
                          {formatPrice(b.totalPrice ?? b.total ?? 0)}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          Deposit: {formatPrice(b.deposit ?? 200000)}
                        </div>
                        <div className="mt-0.5">
                          <StatusBadge status={b.paymentStatus || 'pending'} size="sm" />
                        </div>
                      </td>

                      {/* Status Booking */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <StatusBadge status={b.status} size="sm" />
                      </td>

                      {/* Aksi */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/admin/bookings/${b.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-50 text-primary-900 hover:bg-primary-100 font-bold text-xs transition-colors"
                          >
                            <span>Detail</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RentalHistory;
