/**
 * Matriks Izin (Single Source of Truth) untuk Panel Admin RodaKita.
 * Peran yang didukung:
 * - 'admin' : Akses penuh ke seluruh fitur, konfigurasi, pembatalan refund, dan audit log.
 * - 'staff' : Akses operasional harian (Dashboard, Booking konfirmasi/serah terima/kembali, Dokumen, Kalender, Servis, Pesan).
 * - 'customer': Pengguna publik (dilarang mengakses /admin/*).
 */

export type AdminRole = 'admin' | 'staff' | 'customer';

export type Permission =
  // Dashboard
  | 'dashboard:view'
  // Booking
  | 'bookings:view'
  | 'bookings:confirm_payment'
  | 'bookings:handover'
  | 'bookings:return'
  | 'bookings:add_note'
  | 'bookings:cancel_refund'
  // Dokumen
  | 'documents:view'
  | 'documents:verify'
  | 'documents:reject'
  // Kalender & Ketersediaan
  | 'calendar:view'
  // Perawatan & Servis
  | 'maintenance:view'
  | 'maintenance:create'
  | 'maintenance:complete'
  // Pesan Kontak
  | 'messages:view'
  | 'messages:mark_read'
  // Motor / Armada (Hanya Admin)
  | 'motors:view'
  | 'motors:create'
  | 'motors:edit'
  | 'motors:change_status'
  | 'motors:delete'
  // Pengguna (Hanya Admin)
  | 'users:view'
  | 'users:create'
  | 'users:edit_role'
  | 'users:toggle_status'
  // Ulasan (Hanya Admin)
  | 'reviews:view'
  | 'reviews:moderate'
  | 'reviews:delete'
  // Promosi (Hanya Admin)
  | 'promos:view'
  | 'promos:manage'
  // Addon (Hanya Admin)
  | 'addons:view'
  | 'addons:manage'
  // Lokasi (Hanya Admin)
  | 'locations:view'
  | 'locations:manage'
  // Pengaturan (Hanya Admin)
  | 'settings:view'
  | 'settings:edit'
  // Laporan (Hanya Admin)
  | 'reports:view'
  | 'reports:export'
  // Audit Log (Hanya Admin)
  | 'audit:view'
  // Aturan Harga & Diskon Dinamis (Hanya Admin)
  | 'pricing:view'
  | 'pricing:manage';

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  admin: [
    'dashboard:view',
    'bookings:view',
    'bookings:confirm_payment',
    'bookings:handover',
    'bookings:return',
    'bookings:add_note',
    'bookings:cancel_refund',
    'documents:view',
    'documents:verify',
    'documents:reject',
    'calendar:view',
    'maintenance:view',
    'maintenance:create',
    'maintenance:complete',
    'messages:view',
    'messages:mark_read',
    'motors:view',
    'motors:create',
    'motors:edit',
    'motors:change_status',
    'motors:delete',
    'users:view',
    'users:create',
    'users:edit_role',
    'users:toggle_status',
    'reviews:view',
    'reviews:moderate',
    'reviews:delete',
    'promos:view',
    'promos:manage',
    'addons:view',
    'addons:manage',
    'locations:view',
    'locations:manage',
    'settings:view',
    'settings:edit',
    'reports:view',
    'reports:export',
    'audit:view',
    'pricing:view',
    'pricing:manage',
  ],
  staff: [
    'dashboard:view',
    'bookings:view',
    'bookings:confirm_payment',
    'bookings:handover',
    'bookings:return',
    'bookings:add_note',
    'documents:view',
    'documents:verify',
    'documents:reject',
    'calendar:view',
    'maintenance:view',
    'maintenance:create',
    'maintenance:complete',
    'messages:view',
    'messages:mark_read',
    'motors:view',
  ],
  customer: [],
};

/**
 * Cek apakah sebuah role memiliki izin spesifik.
 */
export function hasPermission(role?: AdminRole | null, permission?: Permission): boolean {
  if (!role || !permission) return false;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Cek apakah role memiliki setidaknya salah satu izin.
 */
export function hasAnyPermission(role?: AdminRole | null, permissions: Permission[] = []): boolean {
  if (!role || permissions.length === 0) return false;
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Cek apakah role diizinkan masuk ke panel admin (staff atau admin).
 */
export function isAdminOrStaff(role?: string | null): boolean {
  return role === 'admin' || role === 'staff';
}
