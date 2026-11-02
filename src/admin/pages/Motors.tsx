import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Star,
  PowerOff,
  AlertTriangle,
  X,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { Motor } from '../../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { StatusBadge } from '../components/StatusBadge';
import { CsvButton } from '../components/CsvButton';
import { formatPrice } from '../../utils/formatPrice';
import { usePermission } from '../hooks/usePermission';
import { MotorRentalHistoryModal } from '../components/MotorRentalHistoryModal';

export const Motors: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const [motors, setMotors] = useState<Motor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Quick Status Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedMotor, setSelectedMotor] = useState<Motor | null>(null);
  const [targetStatus, setTargetStatus] = useState<'available' | 'maintenance' | 'inactive'>('available');
  const [statusLoading, setStatusLoading] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Rental History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyMotor, setHistoryMotor] = useState<Motor | null>(null);

  const openRentalHistory = (motor: Motor) => {
    setHistoryMotor(motor);
    setHistoryModalOpen(true);
  };

  const fetchMotors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getMotors({
        search,
        brand: brandFilter,
        type: typeFilter,
        status: statusFilter,
        page,
        limit,
      });
      setMotors(res.data);
      if (res.meta) {
        setTotal(res.meta.total ?? 0);
        setTotalPages(res.meta.totalPages ?? 1);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat katalog motor.');
    } finally {
      setLoading(false);
    }
  }, [search, brandFilter, typeFilter, statusFilter, page, limit]);

  useEffect(() => {
    fetchMotors();
  }, [fetchMotors]);

  const openStatusChange = (motor: Motor) => {
    setSelectedMotor(motor);
    setTargetStatus((motor.status as any) || 'available');
    setConflictWarning(null);
    setStatusModalOpen(true);
  };

  const handleExecuteStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMotor) return;
    setStatusLoading(true);
    setConflictWarning(null);

    try {
      await adminApi.updateMotorStatus(selectedMotor.id, targetStatus);
      const statusLabel =
        targetStatus === 'available'
          ? 'Aktif (Tersedia)'
          : targetStatus === 'maintenance'
          ? 'Dalam Servis'
          : 'Nonaktif';
      toast.success(`Status ${selectedMotor.name} berhasil diubah menjadi ${statusLabel}.`);
      setStatusModalOpen(false);
      setSelectedMotor(null);
      fetchMotors();
    } catch (err: any) {
      setConflictWarning(err.message || 'Gagal mengubah status unit motor.');
      toast.error(err.message || 'Status tidak dapat diubah karena ada bentrok booking.');
    } finally {
      setStatusLoading(false);
    }
  };

  const columns: Column<Motor>[] = [
    {
      key: 'name',
      header: 'Foto & Nama Motor',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-14 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
            <img
              src={
                item.images?.[0] ||
                'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=80'
              }
              alt={item.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openRentalHistory(item);
              }}
              title="Klik untuk melihat riwayat penyewaan unit ini"
              className="font-bold text-gray-900 hover:text-primary-900 hover:underline text-left block text-xs"
            >
              {item.name}
            </button>
            <p className="text-[11px] text-gray-400 capitalize">
              {item.brand} • {item.cc} cc • {item.year}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'plate',
      header: 'Plat Nomor',
      render: (item) => (
        <span className="font-mono font-bold text-gray-800 text-xs px-2 py-0.5 rounded bg-gray-100 border border-gray-200">
          {item.plate || '-'}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Tipe',
      render: (item) => (
        <span className="capitalize text-xs font-medium text-gray-700">{item.type}</span>
      ),
    },
    {
      key: 'pricePerDay',
      header: 'Harga / Hari',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="font-bold text-gray-900 text-xs">
          {formatPrice(item.pricePerDay)}
        </span>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'center',
      render: (item) => (
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
          <span>{item.rating || 5.0}</span>
          <span className="text-gray-400 text-[10px]">({item.reviewCount || 0})</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openRentalHistory(item)}
            title="Lihat Riwayat Sewa Unit Ini"
            className="p-1.5 rounded-lg text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors font-semibold"
          >
            <History className="w-4 h-4" />
          </button>

          {can('motors:change_status') && (
            <button
              type="button"
              onClick={() => openStatusChange(item)}
              title="Ubah Status Cepat (Aktif / Servis / Nonaktif)"
              className="p-1.5 rounded-lg text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              <PowerOff className="w-4 h-4" />
            </button>
          )}

          {can('motors:edit') && (
            <button
              type="button"
              onClick={() => navigate(`/admin/motors/${item.id}/edit`)}
              title="Edit Data & Tarif Motor"
              className="p-1.5 bg-primary-50 hover:bg-primary-100 text-primary-900 rounded-lg text-xs font-semibold"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Armada Motor</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola inventaris armada, tarif sewa harian, plat nomor unik, dan ketersediaan unit.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <Link
            to="/admin/rental-history"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <History className="w-4 h-4 text-primary-900" />
            <span>Riwayat Sewa Armada</span>
          </Link>

          {can('motors:create') && (
            <Link
              to="/admin/motors/new"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tambah Motor Baru
            </Link>
          )}
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        searchPlaceholder="Cari nama motor atau plat nomor..."
        selects={[
          {
            key: 'status',
            value: statusFilter,
            options: [
              { label: 'Semua Status', value: 'all' },
              { label: 'Aktif / Tersedia', value: 'available' },
              { label: 'Dalam Servis', value: 'maintenance' },
              { label: 'Nonaktif', value: 'inactive' },
            ],
            onChange: (st) => {
              setStatusFilter(st);
              setPage(1);
            },
          },
          {
            key: 'brand',
            value: brandFilter,
            options: [
              { label: 'Semua Merek', value: 'all' },
              { label: 'Honda', value: 'Honda' },
              { label: 'Yamaha', value: 'Yamaha' },
              { label: 'Vespa', value: 'Vespa' },
              { label: 'Kawasaki', value: 'Kawasaki' },
            ],
            onChange: (b) => {
              setBrandFilter(b);
              setPage(1);
            },
          },
          {
            key: 'type',
            value: typeFilter,
            options: [
              { label: 'Semua Tipe', value: 'all' },
              { label: 'Matic', value: 'matic' },
              { label: 'Manual', value: 'manual' },
              { label: 'Sport', value: 'sport' },
              { label: 'Trail', value: 'trail' },
            ],
            onChange: (t) => {
              setTypeFilter(t);
              setPage(1);
            },
          },
        ]}
        hasActiveFilters={
          search !== '' || brandFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all'
        }
        onReset={() => {
          setSearch('');
          setBrandFilter('all');
          setTypeFilter('all');
          setStatusFilter('all');
          setPage(1);
        }}
      >
        <CsvButton
          data={motors}
          columns={[
            { header: 'Nama Model', accessor: (m) => m.name },
            { header: 'Plat Nomor', accessor: (m) => m.plate },
            { header: 'Merek', accessor: (m) => m.brand },
            { header: 'Tipe', accessor: (m) => m.type },
            { header: 'CC Mesin', accessor: (m) => m.cc },
            { header: 'Tahun', accessor: (m) => m.year },
            { header: 'Tarif / Hari (Rp)', accessor: (m) => m.pricePerDay },
            { header: 'Deposit (Rp)', accessor: (m) => m.deposit },
            { header: 'Status', accessor: (m) => m.status },
            { header: 'Rating', accessor: (m) => m.rating },
          ]}
          filename={`armada-motor-${new Date().toISOString().split('T')[0]}.csv`}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={motors}
        loading={loading}
        error={error}
        onRetry={fetchMotors}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        onRowClick={(item) => navigate(`/admin/motors/${item.id}/edit`)}
        emptyText="Unit motor tidak ditemukan"
        emptySubtext="Sesuaikan kata kunci pencarian atau reset filter katalog."
      />

      {/* Quick Status Change Modal with Conflict Warning */}
      {statusModalOpen && selectedMotor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Ubah Status Cepat Armada</h3>
                <p className="text-xs text-gray-500">{selectedMotor.name} ({selectedMotor.plate})</p>
              </div>
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteStatusChange} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">
                  Pilih Status Operasional:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetStatus('available');
                      setConflictWarning(null);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      targetStatus === 'available'
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Aktif (Tersedia)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetStatus('maintenance');
                      setConflictWarning(null);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      targetStatus === 'maintenance'
                        ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Dalam Servis
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetStatus('inactive');
                      setConflictWarning(null);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      targetStatus === 'inactive'
                        ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Nonaktif
                  </button>
                </div>
              </div>

              {/* Conflict Warning Box */}
              {conflictWarning && (
                <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="block font-bold">Peringatan Bentrok Jadwal:</strong>
                    <span>{conflictWarning}</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-gray-500">
                Unit tidak dapat dihapus permanen untuk menjaga integritas data histori sewa. Gunakan status <strong>Nonaktif</strong> jika unit ditarik dari peredaran.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setStatusModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={statusLoading}
                  className="px-5 py-2 bg-primary-900 hover:bg-primary-800 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {statusLoading ? 'Menyimpan...' : 'Terapkan Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rental History Modal */}
      <MotorRentalHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        motor={historyMotor}
      />
    </div>
  );
};
export default Motors;
