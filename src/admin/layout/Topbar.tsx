import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  LogOut,
  UserCheck,
  AlertTriangle,
  FileCheck2,
} from 'lucide-react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { adminApi } from '../services/adminApi';
import type { AdminBooking, AdminDocument } from '../types';
import { RealtimeStatusBadge } from '../../components/RealtimeStatusBadge';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';

interface TopbarProps {
  onToggleSidebar: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar }) => {
  const { currentUser, role, logout } = useAdminAuth();
  const navigate = useNavigate();

  const [searchCode, setSearchCode] = useState('');
  const [showAlertMenu, setShowAlertMenu] = useState(false);

  const [pendingDocs, setPendingDocs] = useState<AdminDocument[]>([]);
  const [overdueBookings, setOverdueBookings] = useState<AdminBooking[]>([]);

  const fetchAlerts = React.useCallback(async () => {
    try {
      const [docsRes, bookingsRes] = await Promise.all([
        adminApi.getDocuments({ status: 'pending' }),
        adminApi.getBookings({ status: 'active' }),
      ]);
      setPendingDocs(docsRes.data);
      const nowStr = new Date().toISOString().split('T')[0];
      const overdue = bookingsRes.data.filter((b) => b.endDate < nowStr);
      setOverdueBookings(overdue);
    } catch {
      // silent
    }
  }, []);

  // Berlangganan event realtime: dokumen diunggah/direview, atau counters berubah
  useRealtimeSubscription('counters.changed', fetchAlerts);
  useRealtimeSubscription('document.updated', fetchAlerts);
  useRealtimeSubscription('booking.updated', fetchAlerts);

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 15000);
    return () => {
      clearInterval(timer);
    };
  }, [fetchAlerts]);

  const totalAlerts = pendingDocs.length + overdueBookings.length;

  const handleSearchCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    const code = searchCode.trim().toUpperCase();
    navigate(`/admin/bookings?search=${encodeURIComponent(code)}`);
    setSearchCode('');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Toggle & Quick Booking Search */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 lg:hidden focus:outline-none"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Quick Search Booking Code */}
        <form onSubmit={handleSearchCode} className="relative w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            placeholder="Cari booking code (contoh: RM-261023-XXXX)... [Enter]"
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-900 focus:bg-white text-gray-800 placeholder-gray-400 transition-all"
          />
        </form>
      </div>

      {/* Right: Static Server Role Badge, Alerts & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Role Badge (Read-only, derived strictly from server session) */}
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold border border-gray-200"
          title={`Peran terverifikasi server: ${(role || 'GUEST').toUpperCase()}`}
        >
          <UserCheck className="w-3.5 h-3.5 text-primary-900" />
          <span className="hidden sm:inline text-gray-500 font-medium">Role:</span>
          <span className="uppercase text-primary-900 font-bold">{role || 'GUEST'}</span>
        </div>

        {/* Realtime Status Indicator */}
        <RealtimeStatusBadge className="hidden sm:inline-flex" />

        {/* Task Notification Bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowAlertMenu(!showAlertMenu);
            }}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 relative focus:outline-none"
            title="Pemberitahuan Tugas"
          >
            <Bell className="w-4 h-4" />
            {totalAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          {showAlertMenu && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-lg border border-gray-100 p-3 z-50 text-xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                <span className="font-bold text-gray-900">Perhatian Operasional</span>
                <span className="text-[10px] bg-primary-50 text-primary-900 px-2 py-0.5 rounded-full font-semibold">
                  {totalAlerts} Perlu Tindakan
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pendingDocs.length > 0 && (
                  <div
                    onClick={() => {
                      setShowAlertMenu(false);
                      navigate('/admin/documents');
                    }}
                    className="p-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer flex items-start gap-2.5 transition-colors"
                  >
                    <FileCheck2 className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-amber-900">
                        {pendingDocs.length} Dokumen Menunggu Verifikasi
                      </p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        KTP/SIM pelanggan baru perlu ditinjau.
                      </p>
                    </div>
                  </div>
                )}

                {overdueBookings.length > 0 && (
                  <div
                    onClick={() => {
                      setShowAlertMenu(false);
                      navigate('/admin/bookings?status=active');
                    }}
                    className="p-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer flex items-start gap-2.5 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-rose-900">
                        {overdueBookings.length} Rental Lewat Batas Waktu
                      </p>
                      <p className="text-[11px] text-rose-700 mt-0.5">
                        Unit belum dikembalikan melebihi jadwal akhir sewa.
                      </p>
                    </div>
                  </div>
                )}

                {totalAlerts === 0 && (
                  <div className="text-center py-6 text-gray-400">
                    <p className="text-xs">Semua tugas operasional telah selesai!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
          <div className="w-7 h-7 rounded-full bg-primary-900 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
            {currentUser?.name?.charAt(0) || 'A'}
          </div>
          <div className="hidden md:block text-left text-xs">
            <p className="font-semibold text-gray-800 leading-tight truncate max-w-[120px]">
              {currentUser?.name || 'Admin'}
            </p>
            <p className="text-[10px] text-gray-500 capitalize">{role}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/admin/login', { replace: true });
            }}
            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
            title="Keluar dari Panel Admin"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
