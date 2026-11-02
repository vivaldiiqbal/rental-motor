import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users as UsersIcon,
  Plus,
  UserCheck,
  UserX,
  Eye,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { AdminUser } from '../types';
import type { AdminRole } from '../permissions';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { CsvButton } from '../components/CsvButton';
import { formatDate } from '../../utils/formatDate';
import { usePermission } from '../hooks/usePermission';

export const Users: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Create User Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('customer');
  const [submitting, setSubmitting] = useState(false);

  // Role Change Dialog
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    isOpen: boolean;
    user: AdminUser | null;
    targetRole: AdminRole;
  }>({
    isOpen: false,
    user: null,
    targetRole: 'customer',
  });
  const [roleLoading, setRoleLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getUsers({
        role: roleFilter,
        search,
        page,
        limit,
      });
      setUsers(res.data);
      if (res.meta) {
        setTotal(res.meta.total || 0);
        setTotalPages(res.meta.totalPages || 1);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat pengguna.');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search, page, limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async (user: AdminUser) => {
    try {
      const updated = await adminApi.toggleUserStatus(user.id);
      toast.success(
        `Status akun ${user.name} diubah menjadi ${updated.isActive ? 'Aktif' : 'Nonaktif'}.`,
      );
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah status akun.');
    }
  };

  const handleConfirmRoleChange = async () => {
    if (!roleChangeDialog.user) return;
    setRoleLoading(true);
    try {
      await adminApi.updateUserRole(roleChangeDialog.user.id, roleChangeDialog.targetRole);
      toast.success(
        `Peran ${roleChangeDialog.user.name} berhasil diubah ke ${roleChangeDialog.targetRole.toUpperCase()}.`,
      );
      setRoleChangeDialog({ isOpen: false, user: null, targetRole: 'customer' });
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memperbarui peran pengguna.');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      toast.error('Nama dan email wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.createUser({
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        phone: newPhone.trim(),
        role: newRole,
      });
      toast.success(`Akun baru untuk ${newName} berhasil dibuat.`);
      setCreateModalOpen(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Gagal membuat pengguna.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Nama Pengguna',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-900 font-bold flex items-center justify-center text-xs uppercase flex-shrink-0">
            {item.name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{item.name}</p>
            <p className="text-[11px] text-gray-400">{item.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'No. Telepon / WA',
      render: (item) => (
        <span className="font-mono text-xs text-gray-700">{item.phone || '-'}</span>
      ),
    },
    {
      key: 'role',
      header: 'Peran (Role)',
      align: 'center',
      render: (item) => <StatusBadge status={item.role} size="sm" />,
    },
    {
      key: 'isActive',
      header: 'Status Akun',
      align: 'center',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            item.isActive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {item.isActive ? 'Aktif' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Terdaftar Sejak',
      render: (item) => (
        <span className="text-gray-600 text-xs">{formatDate(item.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {can('users:edit_role') && (
            <select
              value={item.role}
              onChange={(e) => {
                const tr = e.target.value as AdminRole;
                setRoleChangeDialog({
                  isOpen: true,
                  user: item,
                  targetRole: tr,
                });
              }}
              className="text-xs py-1 px-2 bg-gray-50 border border-gray-300 rounded font-semibold text-gray-700"
            >
              <option value="customer">Customer</option>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          )}

          {can('users:toggle_status') && (
            <button
              type="button"
              onClick={() => handleToggleStatus(item)}
              title={item.isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                item.isActive
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
              }`}
            >
              {item.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(`/admin/users/${item.id}`)}
            title="Lihat Profil Pengguna"
            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Pengguna & Staf</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola akun pelanggan, staf operasional, administrator, hak akses, dan status keaktifan.
          </p>
        </div>

        {can('users:create') && (
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-900 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Tambah Pengguna
          </button>
        )}
      </div>

      <FilterBar
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        searchPlaceholder="Cari nama, email, atau telepon..."
        selects={[
          {
            key: 'role',
            value: roleFilter,
            options: [
              { label: 'Semua Peran', value: 'all' },
              { label: 'Pelanggan (Customer)', value: 'customer' },
              { label: 'Staf Operasional (Staff)', value: 'staff' },
              { label: 'Administrator (Admin)', value: 'admin' },
            ],
            onChange: (r) => {
              setRoleFilter(r);
              setPage(1);
            },
          },
        ]}
        hasActiveFilters={search !== '' || roleFilter !== 'all'}
        onReset={() => {
          setSearch('');
          setRoleFilter('all');
          setPage(1);
        }}
      >
        <CsvButton
          data={users}
          columns={[
            { header: 'Nama', accessor: (u) => u.name },
            { header: 'Email', accessor: (u) => u.email },
            { header: 'Telepon', accessor: (u) => u.phone },
            { header: 'Peran', accessor: (u) => u.role },
            { header: 'Status Aktif', accessor: (u) => (u.isActive ? 'Aktif' : 'Nonaktif') },
            { header: 'Tanggal Daftar', accessor: (u) => u.createdAt },
          ]}
          filename={`daftar-pengguna-${new Date().toISOString().split('T')[0]}.csv`}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        error={error}
        onRetry={fetchUsers}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l);
          setPage(1);
        }}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
        emptyText="Tidak ada akun pengguna"
        emptySubtext="Sesuaikan kata kunci pencarian atau filter peran."
      />

      {/* Modal Tambah Pengguna */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setCreateModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-gray-100 space-y-4">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-primary-900" />
                <h3 className="text-base font-bold text-gray-900">Tambah Akun Pengguna</h3>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
                <FormField label="Nama Lengkap" required>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    required
                  />
                </FormField>

                <FormField label="Alamat Email" required>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@contoh.id"
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    required
                  />
                </FormField>

                <FormField label="Nomor WhatsApp">
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-mono"
                  />
                </FormField>

                <FormField label="Peran (Role Akses)" required>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as AdminRole)}
                    className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                  >
                    <option value="customer">Customer (Pelanggan Biasa)</option>
                    <option value="staff">Staff (Operasional Harian)</option>
                    <option value="admin">Admin (Akses Penuh)</option>
                  </select>
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
                    {submitting ? 'Menyimpan...' : 'Buat Akun'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      <ConfirmDialog
        isOpen={roleChangeDialog.isOpen}
        title="Ubah Peran Hak Akses"
        message={`Apakah Anda yakin ingin mengubah hak akses pengguna "${roleChangeDialog.user?.name}" menjadi "${roleChangeDialog.targetRole.toUpperCase()}"? Perubahan akan langsung memengaruhi akses menu sistem.`}
        variant="warning"
        confirmText="Ubah Peran"
        loading={roleLoading}
        onConfirm={handleConfirmRoleChange}
        onClose={() =>
          setRoleChangeDialog({ isOpen: false, user: null, targetRole: 'customer' })
        }
      />
    </div>
  );
};
export default Users;
