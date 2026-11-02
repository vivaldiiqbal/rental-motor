import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  CheckCircle2,
  Key,
  RotateCcw,
  Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { AdminBooking } from '../types';
import type { Motor } from '../../types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CsvButton } from '../components/CsvButton';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { usePermission } from '../hooks/usePermission';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';

export const Bookings: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, role } = usePermission();

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [motors, setMotors] = useState<Motor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Status Counts for Tabs
  const [statusCounts, setStatusCounts] = useState<{ [key: string]: number }>({
    all: 0,
    pending: 0,
    confirmed: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  });

  // Filters & Pagination
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const statusParam = searchParams.get('status') || 'all';
  const searchParam = searchParams.get('search') || '';
  const motorParam = searchParams.get('motorId') || 'all';
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';

  const [search, setSearch] = useState<string>(searchParam);
  const [selectedMotor, setSelectedMotor] = useState<string>(motorParam);
  const [startDate, setStartDate] = useState<string>(startDateParam);
  const [endDate, setEndDate] = useState<string>(endDateParam);

  // Modals & Action Dialogs
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'confirm_payment' | 'handover' | 'return' | 'cancel' | null;
    booking: AdminBooking | null;
    title: string;
    message: string;
    variant: 'primary' | 'warning' | 'danger';
    confirmText: string;
  }>({
    isOpen: false,
    type: null,
    booking: null,
    title: '',
    message: '',
    variant: 'primary',
    confirmText: 'Konfirmasi',
  });

  // Load motor list for dropdown
  useEffect(() => {
    adminApi.getMotors({ limit: 100 }).then((res) => {
      setMotors(res.data);
    }).catch(() => {});
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getBookings({
        status: statusParam,
        search,
        motorId: selectedMotor !== 'all' ? selectedMotor : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      });
      setBookings(res.data);
      if (res.meta) {
        setTotal(res.meta.total ?? 0);
        setTotalPages(res.meta.totalPages ?? 1);
        if (res.meta.statusCounts) {
          setStatusCounts(res.meta.statusCounts as any);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar pemesanan.');
    } finally {
      setLoading(false);
    }
  }, [statusParam, search, selectedMotor, startDate, endDate, page, limit]);

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    return registerRefetch('admin-bookings-list', () => {
      fetchBookings();
    });
  }, [registerRefetch, fetchBookings]);

  useRealtimeSubscription(['booking.updated', 'payment.updated', 'motor.availability.changed'], () => {
    fetchBookings();
  });

  const handleStatusTab = (newStatus: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newStatus === 'all') next.delete('status');
      else next.set('status', newStatus);
      return next;
    });
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!val) next.delete('search');
      else next.set('search', val);
      return next;
    });
    setPage(1);
  };

  const handleMotorChange = (val: string) => {
    setSelectedMotor(val);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val === 'all') next.delete('motorId');
      else next.set('motorId', val);
      return next;
    });
    setPage(1);
  };

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (start) next.set('startDate', start);
      else next.delete('startDate');
      if (end) next.set('endDate', end);
      else next.delete('endDate');
      return next;
    });
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedMotor('all');
    setStartDate('');
    setEndDate('');
    setSearchParams({});
    setPage(1);
  };

  // Open confirmation modal for safe action handling
  const triggerAction = (
    type: 'confirm_payment' | 'handover' | 'return' | 'cancel',
    booking: AdminBooking,
  ) => {
    switch (type) {
      case 'confirm_payment':
        setConfirmDialog({
          isOpen: true,
          type,
          booking,
          title: 'Konfirmasi Pembayaran Manual',
          message: `Verifikasi pembayaran sebesar ${formatPrice(
            booking.total ?? booking.totalPrice ?? 0,
          )} untuk booking ${booking.code || booking.bookingCode}? Status akan diubah menjadi "Dikonfirmasi".`,
          variant: 'primary',
          confirmText: 'Konfirmasi Bayar',
        });
        break;

      case 'handover':
        setConfirmDialog({
          isOpen: true,
          type,
          booking,
          title: 'Serah Terima Kunci Motor',
          message: `Serahkan unit ${booking.motorName} kepada ${booking.renter?.name || booking.userName}? Status sewa akan beralih menjadi "Aktif".`,
          variant: 'primary',
          confirmText: 'Serahkan Motor',
        });
        break;

      case 'return':
        setConfirmDialog({
          isOpen: true,
          type,
          booking,
          title: 'Penerimaan Pengembalian Unit',
          message: `Konfirmasi unit ${booking.motorName} telah dikembalikan? Status akan diubah menjadi "Selesai".`,
          variant: 'primary',
          confirmText: 'Terima Pengembalian',
        });
        break;

      case 'cancel':
        setConfirmDialog({
          isOpen: true,
          type,
          booking,
          title: 'Batalkan Booking',
          message: `Apakah Anda yakin ingin membatalkan booking ${booking.code || booking.bookingCode}?`,
          variant: 'danger',
          confirmText: 'Batalkan Sewa',
        });
        break;
    }
  };

  const handleExecuteAction = async () => {
    if (actionLoading) return;
    if (!confirmDialog.booking || !confirmDialog.type) return;
    const { type, booking } = confirmDialog;
    setActionLoading(true);

    try {
      if (type === 'confirm_payment') {
        await adminApi.confirmPayment(booking.id, 'transfer', 'Dikonfirmasi cepat via tabel');
        toast.success(`Pembayaran ${booking.code || booking.bookingCode} berhasil dikonfirmasi.`, {
          id: 'booking-action-toast',
        });
      } else if (type === 'handover') {
        await adminApi.handoverMotor(booking.id, {
          startOdometer: booking.startOdometer || 12000,
          initialFuel: 'Penuh (F)',
          conditionNotes: 'Kondisi baik sesuai standar serah terima',
          originalDocsChecked: true,
          depositReceived: true,
        });
        toast.success(`Unit motor berhasil diserahkan.`, { id: 'booking-action-toast' });
      } else if (type === 'return') {
        await adminApi.returnMotor(booking.id, {
          endOdometer: (booking.startOdometer || 12000) + 45,
          finalFuel: 'Penuh (F)',
          notes: 'Unit diterima lengkap tanpa catatan kerusakan.',
        });
        toast.success(`Pengembalian motor selesai.`, { id: 'booking-action-toast' });
      } else if (type === 'cancel') {
        await adminApi.cancelBooking(booking.id, 'Dibatalkan oleh admin melalui panel operasional');
        toast.success(`Booking ${booking.code || booking.bookingCode} telah dibatalkan.`, {
          id: 'booking-action-toast',
        });
      }
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      fetchBookings();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menjalankan aksi operasional.', {
        id: 'booking-action-toast',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const columns: Column<AdminBooking>[] = [
    {
      key: 'bookingCode',
      header: 'Kode Booking',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-mono font-bold text-primary-900">{item.code || item.bookingCode}</span>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {formatDate(item.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Pelanggan',
      render: (item) => (
        <div>
          <p className="font-semibold text-gray-900">{item.renter?.name || item.userName}</p>
          <p className="text-[11px] text-gray-500 font-mono">{item.renter?.phone || item.userPhone}</p>
        </div>
      ),
    },
    {
      key: 'motorName',
      header: 'Motor Disewa',
      render: (item) => (
        <div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleMotorChange(String(item.motorId));
            }}
            title="Klik untuk memfilter semua riwayat sewa motor ini"
            className="font-bold text-primary-900 hover:underline text-left block text-xs"
          >
            {item.motorName || `Motor #${item.motorId}`}
          </button>
          <span className="font-mono text-[10px] text-gray-400 block">
            ID: #{item.motorId}
          </span>
        </div>
      ),
    },
    {
      key: 'startDate',
      header: 'Periode Sewa',
      render: (item) => {
        const diffDays = Math.max(
          1,
          Math.ceil(
            (new Date(item.endDate).getTime() - new Date(item.startDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );
        return (
          <div>
            <p className="text-gray-800">
              {formatDate(item.startDate)} - {formatDate(item.endDate)}
            </p>
            <p className="text-[11px] text-gray-400 font-medium">Durasi: {diffDays} hari</p>
          </div>
        );
      },
    },
    {
      key: 'totalPrice',
      header: 'Total Biaya',
      align: 'right',
      render: (item) => (
        <div className="text-right">
          <span className="font-bold text-gray-900">{formatPrice(item.total ?? item.totalPrice ?? 0)}</span>
          <p className="text-[11px] text-gray-500 capitalize">{item.paymentMethod || 'Manual'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status Sewa',
      align: 'center',
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: 'paymentStatus',
      header: 'Pembayaran',
      align: 'center',
      render: (item) => (
        <div className="flex flex-col items-center gap-0.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              item.paymentStatus === 'paid'
                ? 'bg-emerald-100 text-emerald-800'
                : item.paymentStatus === 'refunded'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {item.paymentStatus === 'paid'
              ? 'Lunas'
              : item.paymentStatus === 'refunded'
              ? 'Refund'
              : 'Menunggu'}
          </span>
          <span className="text-[10px] text-gray-400 uppercase font-mono">{item.paymentMethod || 'Tunai'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {item.status === 'pending' && can('bookings:confirm_payment') && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => triggerAction('confirm_payment', item)}
              title="Konfirmasi Pembayaran Manual"
              className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}

          {item.status === 'confirmed' && can('bookings:handover') && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => navigate(`/admin/bookings/${item.id}`)}
              title="Buka Formulir Serah Terima Kunci"
              className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
            </button>
          )}

          {item.status === 'active' && can('bookings:return') && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => navigate(`/admin/bookings/${item.id}`)}
              title="Buka Formulir Pengembalian Unit"
              className="p-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {role === 'admin' && (item.status === 'pending' || item.status === 'confirmed') && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => triggerAction('cancel', item)}
              title="Batalkan Booking"
              className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            disabled={actionLoading}
            onClick={() => navigate(`/admin/bookings/${item.id}`)}
            title="Lihat Detail Lengkap"
            className="p-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const statusTabs = [
    { key: 'all', label: 'Semua', count: statusCounts.all ?? total },
    { key: 'pending', label: 'Menunggu', count: statusCounts.pending ?? 0 },
    { key: 'confirmed', label: 'Dikonfirmasi', count: statusCounts.confirmed ?? 0 },
    { key: 'active', label: 'Aktif Sewa', count: statusCounts.active ?? 0 },
    { key: 'completed', label: 'Selesai', count: statusCounts.completed ?? 0 },
    { key: 'cancelled', label: 'Dibatalkan', count: statusCounts.cancelled ?? 0 },
  ];

  const hasActiveFilters =
    statusParam !== 'all' ||
    search !== '' ||
    selectedMotor !== 'all' ||
    startDate !== '' ||
    endDate !== '';

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Transaksi Booking</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola alur transaksi sewa, verifikasi pembayaran manual, serah terima, dan kalkulasi pengembalian unit.
          </p>
        </div>
      </div>

      {/* Status Tabs with Counts */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-200 pb-2">
        {statusTabs.map((tab) => {
          const active = statusParam === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleStatusTab(tab.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary-900 text-white shadow-xs'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  active ? 'bg-primary-800 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Motor Filter Banner */}
      {selectedMotor !== 'all' && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-950">
          <div className="flex items-center gap-2">
            <span className="font-bold">Memfilter Riwayat Unit Motor:</span>
            <span className="font-semibold text-primary-900 bg-white px-2.5 py-0.5 rounded-lg border border-indigo-200">
              {motors.find((m) => String(m.id) === selectedMotor)?.name || `Motor #${selectedMotor}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleMotorChange('all')}
            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            Hapus Filter (Tampilkan Semua Motor)
          </button>
        </div>
      )}

      {/* Filter Bar with Motor Dropdown, Date Range, Search & CSV */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search by Code, Name, Phone */}
          <div className="lg:col-span-2">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cari kode booking, nama penyewa, no telepon..."
              className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            />
          </div>

          {/* Motor Filter */}
          <div>
            <select
              value={selectedMotor}
              onChange={(e) => handleMotorChange(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            >
              <option value="all">Semua Unit Motor</option>
              {motors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.plate})
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange(e.target.value, endDate)}
              title="Tanggal Mulai Sewa"
              className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            />
          </div>

          {/* End Date */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange(startDate, e.target.value)}
              title="Tanggal Akhir Sewa"
              className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
            />
          </div>
        </div>

        {/* Action Row: Reset Filter & CSV Button */}
        <div className="flex items-center justify-between pt-1">
          <div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
              >
                Reset Semua Filter
              </button>
            )}
          </div>

          <CsvButton
            data={bookings}
            columns={[
              { header: 'Kode Booking', accessor: (b) => b.code || b.bookingCode || '' },
              { header: 'Nama Pelanggan', accessor: (b) => b.renter?.name || b.userName || '' },
              { header: 'Nomor WhatsApp', accessor: (b) => b.renter?.phone || b.userPhone || '' },
              { header: 'Unit Motor', accessor: (b) => b.motorName || `Motor #${b.motorId}` },
              { header: 'Mulai Sewa', accessor: (b) => b.startDate },
              { header: 'Selesai Sewa', accessor: (b) => b.endDate },
              { header: 'Total Biaya (Rp)', accessor: (b) => b.total ?? b.totalPrice ?? 0 },
              { header: 'Status Booking', accessor: (b) => b.status },
              { header: 'Status Pembayaran', accessor: (b) => b.paymentStatus },
              { header: 'Metode Bayar', accessor: (b) => b.paymentMethod },
              { header: 'Dibuat Pada', accessor: (b) => b.createdAt },
            ]}
            filename={`daftar-booking-${new Date().toISOString().split('T')[0]}.csv`}
          />
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={bookings}
        loading={loading}
        error={error}
        onRetry={fetchBookings}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        onRowClick={(item) => navigate(`/admin/bookings/${item.id}`)}
        emptyText="Tidak ada pemesanan ditemukan"
        emptySubtext="Coba sesuaikan kata kunci pencarian, rentang tanggal, atau filter motor."
      />

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmText={confirmDialog.confirmText}
        loading={actionLoading}
        onConfirm={handleExecuteAction}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
export default Bookings;
