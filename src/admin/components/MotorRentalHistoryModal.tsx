import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  History,
  Bike,
  Calendar,
  DollarSign,
  TrendingUp,
  ArrowRight,
  ExternalLink,
  Gauge,
  Fuel,
} from 'lucide-react';
import type { Motor } from '../../types';
import type { AdminBooking } from '../types';
import { adminApi } from '../services/adminApi';
import { StatusBadge } from './StatusBadge';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';

interface MotorRentalHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  motor: Motor | null;
}

export const MotorRentalHistoryModal: React.FC<MotorRentalHistoryModalProps> = ({
  isOpen,
  onClose,
  motor,
}) => {
  const navigate = useNavigate();

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!isOpen || !motor) return;

    let mounted = true;
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.getBookings({
          motorId: String(motor.id),
          limit: 100,
        });
        if (mounted) {
          setBookings(res.data);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Gagal memuat riwayat penyewaan motor.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchHistory();
    return () => {
      mounted = false;
    };
  }, [isOpen, motor]);

  // Hitung ringkasan statistik utilisasi unit
  const stats = useMemo(() => {
    const totalBookings = bookings.length;
    const activeBookings = bookings.filter((b) => b.status === 'active');
    const completedBookings = bookings.filter((b) => b.status === 'completed');
    const cancelledBookings = bookings.filter((b) => b.status === 'cancelled');

    // Total pendapatan yang dihasilkan oleh motor ini
    const totalRevenue = bookings
      .filter((b) => ['confirmed', 'active', 'completed'].includes(b.status))
      .reduce((sum, b) => {
        const rental = b.totalPrice ?? b.total ?? 0;
        const refund = b.refundAmount ?? 0;
        const extra = (b.lateFee ?? 0) + (b.damageFee ?? 0) + (b.otherFee ?? 0);
        return sum + Math.max(0, rental - refund + extra);
      }, 0);

    // Total hari terpakai
    let totalRentedDays = 0;
    completedBookings.forEach((b) => {
      if (b.startDate && b.endDate) {
        const d1 = new Date(b.startDate).getTime();
        const d2 = new Date(b.endDate).getTime();
        const days = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
        totalRentedDays += days;
      }
    });

    return {
      totalBookings,
      activeCount: activeBookings.length,
      completedCount: completedBookings.length,
      cancelledCount: cancelledBookings.length,
      totalRevenue,
      totalRentedDays,
    };
  }, [bookings]);

  // Filter list berdasarkan tab
  const filteredBookings = useMemo(() => {
    if (statusFilter === 'all') return bookings;
    return bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  if (!isOpen || !motor) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-900 flex items-center justify-center flex-shrink-0 font-bold overflow-hidden border border-primary-200">
              {motor.images && motor.images[0] ? (
                <img src={motor.images[0]} alt={motor.name} className="w-full h-full object-cover" />
              ) : (motor as any).image ? (
                <img src={(motor as any).image} alt={motor.name} className="w-full h-full object-cover" />
              ) : (
                <Bike className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-gray-900">{motor.name}</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-800 font-bold border border-gray-300">
                  {motor.plate || 'Plat -'}
                </span>
                <StatusBadge status={motor.status} size="sm" />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {motor.brand} • {motor.type?.toUpperCase()} • {motor.cc}cc • Tarif {formatPrice(motor.pricePerDay)}/hari
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/admin/bookings?motorId=${motor.id}`);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-primary-900 bg-primary-50 hover:bg-primary-100 transition-colors"
            >
              <span>Buka di Transaksi</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Unit Utilization KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
              <div className="flex items-center justify-between text-blue-700">
                <span className="text-xs font-semibold">Total Disewa</span>
                <History className="w-4 h-4" />
              </div>
              <p className="text-xl font-black text-blue-950 mt-1">{stats.totalBookings}x</p>
              <p className="text-[11px] text-blue-600 mt-0.5">
                {stats.completedCount} selesai, {stats.activeCount} berjalan
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <div className="flex items-center justify-between text-emerald-700">
                <span className="text-xs font-semibold">Total Omzet Unit</span>
                <DollarSign className="w-4 h-4" />
              </div>
              <p className="text-xl font-black text-emerald-950 mt-1">
                {formatPrice(stats.totalRevenue)}
              </p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Kontribusi pendapatan unit</p>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
              <div className="flex items-center justify-between text-indigo-700">
                <span className="text-xs font-semibold">Hari Tersewa</span>
                <Calendar className="w-4 h-4" />
              </div>
              <p className="text-xl font-black text-indigo-950 mt-1">{stats.totalRentedDays} Hari</p>
              <p className="text-[11px] text-indigo-600 mt-0.5">Total durasi operasional</p>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <div className="flex items-center justify-between text-amber-700">
                <span className="text-xs font-semibold">Status Saat Ini</span>
                <TrendingUp className="w-4 h-4" />
              </div>
              <p className="text-sm font-black text-amber-950 mt-2 capitalize">
                {motor.status === 'available' ? 'Siap Disewa' : motor.status === 'maintenance' ? 'Dalam Servis' : 'Nonaktif'}
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Deposit {formatPrice(motor.deposit || 200000)}
              </p>
            </div>
          </div>

          {/* Tab Filter */}
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { key: 'all', label: 'Semua Status', count: bookings.length },
                { key: 'completed', label: 'Selesai', count: stats.completedCount },
                { key: 'active', label: 'Sedang Disewa', count: stats.activeCount },
                { key: 'confirmed', label: 'Terkonfirmasi', count: bookings.filter((b) => b.status === 'confirmed').length },
                { key: 'cancelled', label: 'Dibatalkan', count: stats.cancelledCount },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    statusFilter === tab.key
                      ? 'bg-primary-900 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      statusFilter === tab.key ? 'bg-primary-800 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <span className="text-xs text-gray-500 font-medium">
              Menampilkan {filteredBookings.length} transaksi
            </span>
          </div>

          {/* Bookings Table or Loading / Empty State */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-3 border-primary-900/20 border-t-primary-900 rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Memuat riwayat sewa motor...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-gray-200">
              <Bike className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-600">Belum Ada Riwayat Penyewaan</p>
              <p className="text-xs text-gray-400 mt-1">
                Unit motor ini belum pernah memiliki transaksi sewa dengan status yang dipilih.
              </p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Kode Booking</th>
                    <th className="py-3 px-4">Penyewa</th>
                    <th className="py-3 px-4">Jadwal Sewa</th>
                    <th className="py-3 px-4">Status & Bayar</th>
                    <th className="py-3 px-4 text-right">Total Sewa</th>
                    <th className="py-3 px-4">Serah / Kembali</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredBookings.map((b) => {
                    const durDays =
                      b.startDate && b.endDate
                        ? Math.max(
                            1,
                            Math.ceil(
                              (new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) /
                                (1000 * 60 * 60 * 24),
                            ),
                          )
                        : 1;

                    return (
                      <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                        {/* Kode Booking */}
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(`/admin/bookings/${b.id}`);
                            }}
                            className="font-mono font-bold text-primary-900 hover:underline flex items-center gap-1 text-xs"
                          >
                            <span>{b.code || b.bookingCode}</span>
                            <ArrowRight className="w-3 h-3 text-primary-700" />
                          </button>
                          <span className="text-[10px] text-gray-400 block mt-0.5">
                            Dibuat: {formatDate(b.createdAt)}
                          </span>
                        </td>

                        {/* Penyewa */}
                        <td className="py-3 px-4">
                          <p className="font-semibold text-gray-900">{b.renter?.name || b.userName || 'Penyewa'}</p>
                          <p className="text-[11px] text-gray-500 font-mono">
                            {b.renter?.phone || b.userPhone || '-'}
                          </p>
                        </td>

                        {/* Jadwal Sewa */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-800">
                            {formatDate(b.startDate)} s/d {formatDate(b.endDate)}
                          </div>
                          <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                            {durDays} Hari
                          </span>
                        </td>

                        {/* Status & Bayar */}
                        <td className="py-3 px-4 space-y-1">
                          <StatusBadge status={b.status} size="sm" />
                          <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase font-mono">
                            <span>{b.paymentMethod || 'Manual'}</span>
                            <span>•</span>
                            <span
                              className={`font-semibold ${
                                b.paymentStatus === 'paid'
                                  ? 'text-emerald-600'
                                  : b.paymentStatus === 'refunded'
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                              }`}
                            >
                              {b.paymentStatus || 'pending'}
                            </span>
                          </div>
                        </td>

                        {/* Total Sewa */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-bold text-gray-900 text-xs">
                            {formatPrice(b.totalPrice ?? b.total ?? 0)}
                          </span>
                          {b.deposit && b.deposit > 0 ? (
                            <span className="text-[10px] text-gray-400 block">
                              Deposit: {formatPrice(b.deposit)}
                            </span>
                          ) : null}
                        </td>

                        {/* Serah Terima / Kembali Odometer */}
                        <td className="py-3 px-4 text-[11px] text-gray-600">
                          {b.startOdometer !== undefined || b.handover?.startOdometer !== undefined ? (
                            <div className="flex items-center gap-1">
                              <Gauge className="w-3 h-3 text-gray-400" />
                              <span>KM: {b.startOdometer ?? b.handover?.startOdometer}</span>
                              {b.endOdometer !== undefined || b.returnInfo?.endOdometer !== undefined ? (
                                <span>&rarr; {b.endOdometer ?? b.returnInfo?.endOdometer}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Belum serah terima</span>
                          )}
                          {(b.initialFuel || b.handover?.initialFuel) && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-500">
                              <Fuel className="w-2.5 h-2.5 text-gray-400" />
                              <span>Bensin: {b.initialFuel ?? b.handover?.initialFuel}</span>
                            </div>
                          )}
                        </td>

                        {/* Aksi */}
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(`/admin/bookings/${b.id}`);
                            }}
                            title="Buka Detail Transaksi"
                            className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-primary-900 hover:text-white text-gray-700 transition-colors font-semibold text-[11px] inline-flex items-center gap-1"
                          >
                            <span>Detail</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 flex items-center justify-between bg-gray-50 text-xs">
          <p className="text-gray-500">
            Unit: <span className="font-semibold text-gray-800">{motor.name}</span> ({motor.plate})
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-gray-700 hover:bg-gray-200 transition-colors font-semibold"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/admin/rental-history?motorId=${motor.id}`);
              }}
              className="px-4 py-2 rounded-xl bg-primary-900 hover:bg-primary-800 text-white font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <span>Buka Halaman Lengkap Riwayat Unit</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
