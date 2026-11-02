import React, { useEffect, useState, useCallback } from 'react';
import {
  Wrench,
  Plus,
  CheckCircle2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { MaintenanceBlock } from '../types';
import type { Motor } from '../../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { FormField } from '../components/FormField';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { usePermission } from '../hooks/usePermission';

export const Maintenance: React.FC = () => {
  const { can } = usePermission();

  const [blocks, setBlocks] = useState<MaintenanceBlock[]>([]);
  const [motors, setMotors] = useState<Motor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modal: Create Maintenance
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [motorcycleId, setMotorcycleId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('Ganti Oli Rutin & Tune Up');
  const [cost, setCost] = useState(150000);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal: Complete Maintenance
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<MaintenanceBlock | null>(null);
  const [actualCost, setActualCost] = useState(150000);
  const [completionNote, setCompletionNote] = useState('');

  const fetchMaintenance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [maintRes, motorsRes] = await Promise.all([
        adminApi.getMaintenanceBlocks({
          status: statusFilter,
          page,
          limit,
        }),
        adminApi.getMotors({ limit: 50 }),
      ]);

      setBlocks(maintRes.data);
      setMotors(motorsRes.data);
      if (maintRes.meta) {
        setTotal(maintRes.meta.total ?? 0);
        setTotalPages(maintRes.meta.totalPages ?? 1);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat jadwal servis.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, limit]);

  useEffect(() => {
    fetchMaintenance();
  }, [fetchMaintenance]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motorcycleId) {
      toast.error('Pilih unit motor terlebih dahulu.');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('Tentukan tanggal mulai dan selesai servis.');
      return;
    }
    if (endDate < startDate) {
      toast.error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.createMaintenanceBlock({
        motorId: motorcycleId,
        startDate,
        endDate,
        reason,
        cost: Number(cost) || 0,
      });
      toast.success('Jadwal servis berhasil dibuat.');
      setCreateModalOpen(false);
      setMotorcycleId('');
      setStartDate('');
      setEndDate('');
      fetchMaintenance();
    } catch (err: any) {
      toast.error(err.message || 'Gagal membuat jadwal servis.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlock) return;

    setSubmitting(true);
    try {
      await adminApi.completeMaintenanceBlock(
        selectedBlock.id,
        Number(actualCost),
        completionNote || 'Servis selesai dan motor siap beroperasi kembali',
      );
      toast.success('Servis berhasil diselesaikan. Status motor kembali tersedia.');
      setCompleteModalOpen(false);
      setSelectedBlock(null);
      fetchMaintenance();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyelesaikan servis.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<MaintenanceBlock>[] = [
    {
      key: 'motorcycleName',
      header: 'Unit Motor',
      render: (item) => (
        <div>
          <p className="font-bold text-gray-900">{item.motorName || item.motorcycleName || 'Unit Motor'}</p>
          <p className="text-[11px] text-gray-500 font-mono">{item.motorPlate || '-'}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Keperluan Servis',
      render: (item) => (
        <div>
          <p className="font-semibold text-gray-800">{item.reason}</p>
          {item.notes && <p className="text-[11px] text-gray-500 mt-0.5">{item.notes}</p>}
        </div>
      ),
    },
    {
      key: 'startDate',
      header: 'Periode Servis',
      render: (item) => (
        <span className="text-gray-700 text-xs">
          {formatDate(item.startDate)} - {formatDate(item.endDate)}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Biaya Servis',
      align: 'right',
      render: (item) => (
        <span className="font-bold text-gray-900 text-xs">{formatPrice(item.cost || 0)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (item) => {
        let badgeClass = 'bg-blue-50 text-blue-700 border border-blue-200';
        let label = 'Terjadwal';
        if (item.status === 'in_progress') {
          badgeClass = 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse';
          label = 'Sedang Berlangsung';
        } else if (item.status === 'completed') {
          badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
          label = 'Selesai';
        }
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}>
            {label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Tindakan',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {item.status !== 'completed' && can('maintenance:complete') && (
            <button
              type="button"
              onClick={() => {
                setSelectedBlock(item);
                setActualCost(item.cost || 150000);
                setCompleteModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Selesaikan Servis
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
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Jadwal Servis & Bengkel</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola perawatan armada motor, blok tanggal servis otomatis, dan pembukuan biaya bengkel.
          </p>
        </div>

        {can('maintenance:create') && (
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Jadwalkan Servis Baru
          </button>
        )}
      </div>

      <FilterBar
        selects={[
          {
            key: 'status',
            value: statusFilter,
            options: [
              { label: 'Semua Status', value: 'all' },
              { label: 'Terjadwal (Belum Mulai)', value: 'scheduled' },
              { label: 'Sedang Berlangsung', value: 'in_progress' },
              { label: 'Selesai', value: 'completed' },
            ],
            onChange: (s) => {
              setStatusFilter(s);
              setPage(1);
            },
          },
        ]}
        hasActiveFilters={statusFilter !== 'all'}
        onReset={() => {
          setStatusFilter('all');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={blocks}
        loading={loading}
        error={error}
        onRetry={fetchMaintenance}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        emptyText="Belum ada catatan servis"
        emptySubtext="Semua unit armada dalam kondisi prima atau tidak ada filter yang cocok."
      />

      {/* Modal Jadwalkan Servis Baru */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setCreateModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-gray-100 space-y-4">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-gray-900">Jadwalkan Servis Motor</h3>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
                <FormField label="Pilih Unit Motor" required>
                  <select
                    value={motorcycleId}
                    onChange={(e) => setMotorcycleId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    required
                  >
                    <option value="">-- Pilih Motor --</option>
                    {motors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.plate || 'DK 1234 RK'}) - {m.status}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Mulai Tanggal" required>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                      required
                    />
                  </FormField>
                  <FormField label="Selesai Tanggal" required>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                      required
                    />
                  </FormField>
                </div>

                <FormField label="Jenis Servis / Kerusakan" required>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Contoh: Ganti Ban Depan & Kampas Rem"
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    required
                  />
                </FormField>

                <FormField label="Estimasi Biaya Servis (Rp)">
                  <input
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(Number(e.target.value))}
                    min={0}
                    step={10000}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                  />
                </FormField>

                <FormField label="Catatan Bengkel">
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Bengkel rekanan AHASS / keluhan tarikan gas..."
                    className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  />
                </FormField>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Jadwal'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selesaikan Servis */}
      {completeModalOpen && selectedBlock && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setCompleteModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-gray-100 space-y-4">
              <button
                type="button"
                onClick={() => setCompleteModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-gray-900">Konfirmasi Servis Selesai</h3>
              </div>

              <p className="text-xs text-gray-600">
                Unit <span className="font-semibold text-gray-900">{selectedBlock.motorcycleName}</span>{' '}
                telah rampung diservis dan statusnya akan kembali menjadi{' '}
                <span className="font-bold text-emerald-700">Tersedia (Ready Sewa)</span>.
              </p>

              <form onSubmit={handleCompleteSubmit} className="space-y-4 pt-2">
                <FormField label="Biaya Aktual Servis (Rp)" required>
                  <input
                    type="number"
                    value={actualCost}
                    onChange={(e) => setActualCost(Number(e.target.value))}
                    min={0}
                    step={5000}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                    required
                  />
                </FormField>

                <FormField label="Laporan Hasil Servis">
                  <textarea
                    rows={2}
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                    placeholder="Oli baru diganti, rem pakem, motor siap jalan..."
                    className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  />
                </FormField>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setCompleteModalOpen(false)}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                  >
                    {submitting ? 'Memproses...' : 'Tandai Selesai'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Maintenance;
