import React, { useEffect, useState, useCallback } from 'react';
import { PackagePlus, Plus, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { AddonItem } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { formatPrice } from '../../utils/formatPrice';
import { usePermission } from '../hooks/usePermission';

export const Addons: React.FC = () => {
  const { can } = usePermission();

  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pricePerDay, setPricePerDay] = useState(15000);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    addon: AddonItem | null;
  }>({
    isOpen: false,
    addon: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchAddons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAddons({ search });
      setAddons(res.data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat layanan tambahan.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchAddons();
  }, [fetchAddons]);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setPricePerDay(15000);
    setDescription('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (item: AddonItem) => {
    setEditingId(item.id);
    setName(item.name);
    setPricePerDay(item.pricePerDay);
    setDescription(item.description || '');
    setIsActive(item.isActive);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama layanan wajib diisi.');
      return;
    }

    setSubmitting(true);
    const payload = {
      name: name.trim(),
      pricePerDay: Number(pricePerDay),
      description: description.trim(),
      isActive,
    };

    try {
      if (editingId) {
        await adminApi.updateAddon(editingId, payload);
        toast.success(`Layanan ${payload.name} berhasil diperbarui.`);
      } else {
        await adminApi.createAddon(payload);
        toast.success(`Layanan ${payload.name} berhasil ditambahkan.`);
      }
      setModalOpen(false);
      fetchAddons();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan layanan tambahan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.addon) return;
    setDeleteLoading(true);
    try {
      await adminApi.deleteAddon(deleteDialog.addon.id);
      toast.success(`Layanan ${deleteDialog.addon.name} berhasil dihapus.`);
      setDeleteDialog({ isOpen: false, addon: null });
      fetchAddons();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus layanan tambahan.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: Column<AddonItem>[] = [
    {
      key: 'name',
      header: 'Nama Layanan Tambahan',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-bold text-gray-900">{item.name}</p>
          <p className="text-[11px] text-gray-400">{item.description || '-'}</p>
        </div>
      ),
    },
    {
      key: 'pricePerDay',
      header: 'Tarif / Hari',
      align: 'right',
      render: (item) => (
        <span className="font-bold text-gray-900 text-xs">
          {formatPrice(item.pricePerDay)}
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
          {item.isActive ? 'Tersedia' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {can('addons:manage') && (
            <>
              <button
                type="button"
                onClick={() => openEditModal(item)}
                title="Edit Layanan"
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteDialog({ isOpen: true, addon: item })}
                title="Hapus Layanan"
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
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Layanan Tambahan (Add-ons)</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola opsi perlengkapan sewa seperti helm ekstra, jas hujan tambahan, dan asuransi.
          </p>
        </div>

        {can('addons:manage') && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Tambah Layanan Baru
          </button>
        )}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari layanan tambahan..."
        hasActiveFilters={search !== ''}
        onReset={() => setSearch('')}
      />

      <DataTable
        columns={columns}
        data={addons}
        loading={loading}
        error={error}
        onRetry={fetchAddons}
        emptyText="Belum ada layanan tambahan"
        emptySubtext="Klik 'Tambah Layanan Baru' untuk mendaftarkan opsi sewa tambahan."
      />

      {/* Modal Addon Form */}
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
                <PackagePlus className="w-5 h-5 text-primary-900" />
                <h3 className="text-base font-bold text-gray-900">
                  {editingId ? 'Edit Layanan Tambahan' : 'Tambah Layanan Baru'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 pt-2">
                <FormField label="Nama Layanan / Barang" required>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Helm SNI Tambahan"
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    required
                  />
                </FormField>

                <FormField label="Tarif Tambahan Per Hari (Rp)" required>
                  <input
                    type="number"
                    value={pricePerDay}
                    onChange={(e) => setPricePerDay(Number(e.target.value))}
                    min={0}
                    step={5000}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                    required
                  />
                </FormField>

                <FormField label="Keterangan / Deskripsi">
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ukuran helm all-size, higienis..."
                    className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  />
                </FormField>

                <FormField label="Status Keaktifan">
                  <select
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  >
                    <option value="true">Tersedia (Bisa Dipilih Pelanggan)</option>
                    <option value="false">Nonaktif (Sembunyikan)</option>
                  </select>
                </FormField>

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
                    {submitting ? 'Menyimpan...' : 'Simpan Layanan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Addon Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Hapus Layanan Tambahan"
        message={`Apakah Anda yakin ingin menghapus "${deleteDialog.addon?.name}"?`}
        variant="danger"
        confirmText="Hapus"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteDialog({ isOpen: false, addon: null })}
      />
    </div>
  );
};
export default Addons;
