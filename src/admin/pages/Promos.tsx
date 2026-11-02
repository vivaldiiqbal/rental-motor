import React, { useEffect, useState, useCallback } from 'react';
import { Tag, Plus, Edit2, Trash2, CheckCircle2, XCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { PromoItem } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { usePermission } from '../hooks/usePermission';

export const Promos: React.FC = () => {
  const { can } = usePermission();

  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState(10);
  const [minSpend, setMinSpend] = useState(100000);
  const [maxDiscount, setMaxDiscount] = useState(50000);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quota, setQuota] = useState(100);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    promo: PromoItem | null;
  }>({
    isOpen: false,
    promo: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getPromos({ search, page, limit });
      setPromos(res.data);
      if (res.meta) {
        setTotal(res.meta.total ?? 0);
        setTotalPages(res.meta.totalPages ?? 1);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar kupon promo.');
    } finally {
      setLoading(false);
    }
  }, [search, page, limit]);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  const openCreateModal = () => {
    setEditingId(null);
    setCode('');
    setDiscountType('percent');
    setDiscountValue(10);
    setMinSpend(100000);
    setMaxDiscount(50000);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setQuota(100);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (p: PromoItem) => {
    setEditingId(p.id);
    setCode(p.code);
    setDiscountType(p.discountType || 'percent');
    setDiscountValue(p.discountValue ?? p.discountPercent ?? 0);
    setMinSpend(p.minSpend || 0);
    setMaxDiscount(p.maxDiscount || 0);
    setStartDate(p.startDate || '');
    setEndDate(p.endDate || '');
    setQuota(p.quota ?? 100);
    setIsActive(p.isActive);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error('Kode promo wajib diisi.');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('Tentukan tanggal mulai dan berakhir promo.');
      return;
    }

    setSubmitting(true);
    const payload = {
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: Number(discountValue),
      minSpend: Number(minSpend),
      maxDiscount: Number(maxDiscount),
      startDate,
      endDate,
      quota: Number(quota),
      usedCount: editingId ? undefined : 0,
      isActive,
    };

    try {
      if (editingId) {
        await adminApi.updatePromo(editingId, payload);
        toast.success(`Promo ${payload.code} berhasil diperbarui.`);
      } else {
        await adminApi.createPromo(payload);
        toast.success(`Promo ${payload.code} berhasil diterbitkan.`);
      }
      setModalOpen(false);
      fetchPromos();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan promo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: PromoItem) => {
    try {
      await adminApi.updatePromo(item.id, { isActive: !item.isActive });
      toast.success(
        `Kupon ${item.code} ${!item.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`,
      );
      fetchPromos();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah status promo.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.promo) return;
    setDeleteLoading(true);
    try {
      await adminApi.deletePromo(deleteDialog.promo.id);
      toast.success(`Promo ${deleteDialog.promo.code} berhasil dihapus.`);
      setDeleteDialog({ isOpen: false, promo: null });
      fetchPromos();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus kupon promo.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: Column<PromoItem>[] = [
    {
      key: 'code',
      header: 'Kode Kupon',
      sortable: true,
      render: (item) => (
        <span className="font-mono font-bold text-xs text-primary-900 bg-primary-50 px-2 py-1 rounded border border-primary-200">
          {item.code}
        </span>
      ),
    },
    {
      key: 'discountValue',
      header: 'Besaran Potongan',
      render: (item) => (
        <div>
          <span className="font-bold text-emerald-700">
            {item.discountType === 'percent'
              ? `${item.discountValue}%`
              : formatPrice(item.discountValue)}
          </span>
          {item.maxDiscount ? (
            <p className="text-[10px] text-gray-400">Maks. {formatPrice(item.maxDiscount)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'minSpend',
      header: 'Min. Belanja',
      align: 'right',
      render: (item) => (
        <span className="text-gray-700 text-xs">{formatPrice(item.minSpend || 0)}</span>
      ),
    },
    {
      key: 'period',
      header: 'Masa Berlaku',
      render: (item) => (
        <span className="text-gray-600 text-xs">
          {formatDate(item.startDate)} - {formatDate(item.endDate)}
        </span>
      ),
    },
    {
      key: 'quota',
      header: 'Kuota Pemakaian',
      align: 'center',
      render: (item) => (
        <span className="text-xs font-semibold text-gray-800">
          {item.usedCount || 0} / {item.quota}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      align: 'center',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            item.isActive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-gray-100 text-gray-600 border border-gray-200'
          }`}
        >
          {item.isActive ? 'Aktif' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {can('promos:manage') && (
            <>
              <button
                type="button"
                onClick={() => handleToggleStatus(item)}
                title={item.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  item.isActive
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                }`}
              >
                {item.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => openEditModal(item)}
                title="Edit Promo"
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteDialog({ isOpen: true, promo: item })}
                title="Hapus Promo"
                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Kupon Promo & Diskon</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola voucher diskon, persentase potongan, batasan kuota, dan masa aktif promo.
          </p>
        </div>

        {can('promos:manage') && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Tambah Promo Baru
          </button>
        )}
      </div>

      <FilterBar
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        searchPlaceholder="Cari kode promo..."
        hasActiveFilters={search !== ''}
        onReset={() => {
          setSearch('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={promos}
        loading={loading}
        error={error}
        onRetry={fetchPromos}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        emptyText="Belum ada kupon promo"
        emptySubtext="Klik 'Tambah Promo Baru' untuk membuat kode promo pertama."
      />

      {/* Modal Form Tambah / Edit Promo */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-gray-100 space-y-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-primary-900" />
                <h3 className="text-base font-bold text-gray-900">
                  {editingId ? 'Edit Kupon Promo' : 'Tambah Kupon Promo Baru'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 pt-2">
                <FormField label="Kode Kupon (Voucher)" required>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Contoh: HEMAT10"
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-mono uppercase font-bold"
                    required
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Tipe Diskon">
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as any)}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-medium"
                    >
                      <option value="percent">Persentase (%)</option>
                      <option value="fixed">Nominal Tetap (Rp)</option>
                    </select>
                  </FormField>

                  <FormField label="Nilai Potongan" required>
                    <input
                      type="number"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(Number(e.target.value))}
                      min={1}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                      required
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Minimal Belanja (Rp)">
                    <input
                      type="number"
                      value={minSpend}
                      onChange={(e) => setMinSpend(Number(e.target.value))}
                      min={0}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    />
                  </FormField>

                  <FormField label="Maksimal Potongan (Rp)">
                    <input
                      type="number"
                      value={maxDiscount}
                      onChange={(e) => setMaxDiscount(Number(e.target.value))}
                      min={0}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    />
                  </FormField>
                </div>

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

                  <FormField label="Berakhir Tanggal" required>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                      required
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Kuota Pemakaian">
                    <input
                      type="number"
                      value={quota}
                      onChange={(e) => setQuota(Number(e.target.value))}
                      min={1}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    />
                  </FormField>

                  <FormField label="Status Keaktifan">
                    <select
                      value={isActive ? 'true' : 'false'}
                      onChange={(e) => setIsActive(e.target.value === 'true')}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    >
                      <option value="true">Aktif</option>
                      <option value="false">Nonaktif</option>
                    </select>
                  </FormField>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Kupon'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Promo Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Hapus Kupon Promo"
        message={`Apakah Anda yakin ingin menghapus kupon "${deleteDialog.promo?.code}"? Pelanggan tidak akan dapat menggunakan kupon ini lagi.`}
        variant="danger"
        confirmText="Hapus Permanen"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteDialog({ isOpen: false, promo: null })}
      />
    </div>
  );
};
export default Promos;
