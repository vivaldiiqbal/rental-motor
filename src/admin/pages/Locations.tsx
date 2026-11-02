import React, { useEffect, useState, useCallback } from 'react';
import { MapPin, Plus, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { LocationItem } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { formatPrice } from '../../utils/formatPrice';
import { usePermission } from '../hooks/usePermission';

export const Locations: React.FC = () => {
  const { can } = usePermission();

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(25000);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Delete Dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    location: LocationItem | null;
  }>({
    isOpen: false,
    location: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getLocations({ search });
      setLocations(res.data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar lokasi antar-jemput.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setAddress('');
    setDeliveryFee(25000);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (item: LocationItem) => {
    setEditingId(item.id);
    setName(item.name);
    setAddress(item.address || '');
    setDeliveryFee(item.deliveryFee || 0);
    setIsActive(item.isActive);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama titik lokasi wajib diisi.');
      return;
    }

    setSubmitting(true);
    const payload = {
      name: name.trim(),
      address: address.trim(),
      deliveryFee: Number(deliveryFee),
      isActive,
    };

    try {
      if (editingId) {
        await adminApi.updateLocation(editingId, payload);
        toast.success(`Titik lokasi ${payload.name} berhasil diperbarui.`);
      } else {
        await adminApi.createLocation(payload);
        toast.success(`Titik lokasi ${payload.name} berhasil ditambahkan.`);
      }
      setModalOpen(false);
      fetchLocations();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan lokasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.location) return;
    setDeleteLoading(true);
    try {
      await adminApi.deleteLocation(deleteDialog.location.id);
      toast.success(`Lokasi ${deleteDialog.location.name} berhasil dihapus.`);
      setDeleteDialog({ isOpen: false, location: null });
      fetchLocations();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus lokasi.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: Column<LocationItem>[] = [
    {
      key: 'name',
      header: 'Nama Titik Penjemputan',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-bold text-gray-900">{item.name}</p>
          <p className="text-[11px] text-gray-400">{item.address || '-'}</p>
        </div>
      ),
    },
    {
      key: 'deliveryFee',
      header: 'Biaya Pengantaran',
      align: 'right',
      render: (item) => (
        <span className="font-bold text-gray-900 text-xs">
          {item.deliveryFee && item.deliveryFee > 0
            ? formatPrice(item.deliveryFee)
            : 'Gratis (Rp 0)'}
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
          {can('locations:manage') && (
            <>
              <button
                type="button"
                onClick={() => openEditModal(item)}
                title="Edit Lokasi"
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteDialog({ isOpen: true, location: item })}
                title="Hapus Lokasi"
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
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Titik Antar-Jemput Motor</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola titik penyerahan unit (Bandara, Stasiun, Garasi, Hotel) beserta tarif ongkos antar.
          </p>
        </div>

        {can('locations:manage') && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Tambah Titik Lokasi
          </button>
        )}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari nama titik atau alamat..."
        hasActiveFilters={search !== ''}
        onReset={() => setSearch('')}
      />

      <DataTable
        columns={columns}
        data={locations}
        loading={loading}
        error={error}
        onRetry={fetchLocations}
        emptyText="Belum ada titik lokasi"
        emptySubtext="Klik 'Tambah Titik Lokasi' untuk mendaftarkan titik antar-jemput baru."
      />

      {/* Modal Lokasi Form */}
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
                <MapPin className="w-5 h-5 text-primary-900" />
                <h3 className="text-base font-bold text-gray-900">
                  {editingId ? 'Edit Titik Antar-Jemput' : 'Tambah Titik Lokasi Baru'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 pt-2">
                <FormField label="Nama Titik / Landmark" required>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Stasiun Gambir (Pintu Selatan)"
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                    required
                  />
                </FormField>

                <FormField label="Alamat / Patokan Lengkap">
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Jl. Medan Merdeka Timur No. 1..."
                    className="w-full text-xs p-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  />
                </FormField>

                <FormField label="Ongkos Antar / Jemput (Rp)" helperText="0 = Gratis biaya antar">
                  <input
                    type="number"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(Number(e.target.value))}
                    min={0}
                    step={5000}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                  />
                </FormField>

                <FormField label="Status Keaktifan">
                  <select
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  >
                    <option value="true">Aktif (Tampil di Form Booking)</option>
                    <option value="false">Nonaktif (Tutup Sementara)</option>
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
                    {submitting ? 'Menyimpan...' : 'Simpan Lokasi'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Location Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Hapus Titik Lokasi"
        message={`Apakah Anda yakin ingin menghapus "${deleteDialog.location?.name}"?`}
        variant="danger"
        confirmText="Hapus"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteDialog({ isOpen: false, location: null })}
      />
    </div>
  );
};
export default Locations;
