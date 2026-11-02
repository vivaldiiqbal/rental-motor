import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarCheck,
  FileCheck2,
  CalendarDays,
  Bike,
  Users,
  Star,
  Tag,
  PackagePlus,
  MapPin,
  MessageSquare,
  BarChart3,
  ScrollText,
  Settings,
  FileText,
  Coins,
  History,
  X,
  ExternalLink,
  Navigation2,
} from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { adminApi } from '../services/adminApi';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { role } = usePermission();
  const [pendingDocsCount, setPendingDocsCount] = useState<number>(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState<number>(0);
  const [gpsHighAlertCount, setGpsHighAlertCount] = useState<number>(0);

  const fetchBadges = React.useCallback(async () => {
    try {
      const [docs, msgs, gps] = await Promise.all([
        adminApi.getDocuments({ status: 'pending' }),
        adminApi.getMessages().catch(() => ({ meta: { unreadCount: 0 } })),
        adminApi.getGpsLive().catch(() => ({ data: { alertsCount: 0 } })),
      ]);
      setPendingDocsCount(docs.meta?.pendingCount ?? docs.meta?.total ?? docs.data?.length ?? 0);
      setUnreadMsgCount(msgs.meta?.unreadCount || 0);
      setGpsHighAlertCount(gps.data?.alertsCount || 0);
    } catch {
      // silent fallback
    }
  }, []);

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, 15000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchBadges]);

  useEffect(() => {
    return registerRefetch('admin-sidebar-badges', () => {
      fetchBadges();
    });
  }, [registerRefetch, fetchBadges]);

  useRealtimeSubscription(['counters.changed', 'document.updated', 'message.new', 'gps.alert'], () => {
    fetchBadges();
  });

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
      isActive
        ? 'bg-white/15 text-white font-semibold shadow-inner'
        : 'text-gray-300 hover:text-white hover:bg-white/10'
    }`;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={onClose}
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-primary-900 text-white flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white font-black text-lg border border-white/20">
              R
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-wide text-white">RodaKita</h2>
              <p className="text-[10px] text-gray-400 font-medium">Panel Admin Operasional</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Nav Items */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6 text-xs">
          {/* Section: Utama */}
          <div className="space-y-1">
            <NavLink to="/admin" end className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-4 h-4 text-primary-200" />
                <span>Dashboard</span>
              </div>
            </NavLink>
          </div>

          {/* Section: Operasional Sewa */}
          <div className="space-y-1">
            <p className="px-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Operasional Sewa
            </p>

            <NavLink to="/admin/bookings" className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <CalendarCheck className="w-4 h-4 text-primary-200" />
                <span>Transaksi Booking</span>
              </div>
            </NavLink>

            <NavLink to="/admin/rental-history" className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-primary-200" />
                <span>Riwayat Sewa Motor</span>
              </div>
            </NavLink>

            <NavLink to="/admin/documents" className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-4 h-4 text-primary-200" />
                <span>Verifikasi Dokumen</span>
              </div>
              {pendingDocsCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-primary-900">
                  {pendingDocsCount}
                </span>
              )}
            </NavLink>

            <NavLink to="/admin/calendar" className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <CalendarDays className="w-4 h-4 text-primary-200" />
                <span>Kalender Sewa</span>
              </div>
            </NavLink>

            <NavLink to="/admin/gps" className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <Navigation2 className="w-4 h-4 text-primary-200" />
                <span>Pelacakan GPS</span>
              </div>
              {gpsHighAlertCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white animate-pulse">
                  {gpsHighAlertCount}
                </span>
              )}
            </NavLink>

            <NavLink to="/admin/motors" className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <Bike className="w-4 h-4 text-primary-200" />
                <span>Armada Motor</span>
              </div>
            </NavLink>
          </div>

          {/* Section: Master Data (Hanya Admin) */}
          {role === 'admin' && (
            <div className="space-y-1">
              <p className="px-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Master Data
              </p>

              <NavLink to="/admin/users" className={navItemClass} onClick={onClose}>
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-primary-200" />
                  <span>Pengguna & Staf</span>
                </div>
              </NavLink>

              <NavLink to="/admin/reviews" className={navItemClass} onClick={onClose}>
                <div className="flex items-center gap-3">
                  <Star className="w-4 h-4 text-primary-200" />
                  <span>Ulasan Pelanggan</span>
                </div>
              </NavLink>

              <NavLink to="/admin/promos" className={navItemClass} onClick={onClose}>
                <div className="flex items-center gap-3">
                  <Tag className="w-4 h-4 text-primary-200" />
                  <span>Promo & Kupon</span>
                </div>
              </NavLink>

              <NavLink to="/admin/addons" className={navItemClass} onClick={onClose}>
                <div className="flex items-center gap-3">
                  <PackagePlus className="w-4 h-4 text-primary-200" />
                  <span>Layanan Tambahan</span>
                </div>
              </NavLink>

              <NavLink to="/admin/pricing" className={navItemClass} onClick={onClose}>
                <div className="flex items-center gap-3">
                  <Coins className="w-4 h-4 text-primary-200" />
                  <span>Aturan Harga & Diskon</span>
                </div>
              </NavLink>

              <NavLink to="/admin/locations" className={navItemClass} onClick={onClose}>
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-primary-200" />
                  <span>Titik Antar-Jemput</span>
                </div>
              </NavLink>
            </div>
          )}

          {/* Section: Komunikasi & Analitik */}
          <div className="space-y-1">
            <p className="px-3.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Komunikasi & Laporan
            </p>

            <NavLink to="/admin/messages" className={navItemClass} onClick={onClose}>
              <div className="flex items-center gap-3">
                <MessageSquare className="w-4 h-4 text-primary-200" />
                <span>Pesan Kontak</span>
              </div>
              {unreadMsgCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-400 text-primary-900">
                  {unreadMsgCount}
                </span>
              )}
            </NavLink>

            {role === 'admin' && (
              <>
                <NavLink to="/admin/reports" className={navItemClass} onClick={onClose}>
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-4 h-4 text-primary-200" />
                    <span>Laporan & Analitik</span>
                  </div>
                </NavLink>

                <NavLink to="/admin/audit" className={navItemClass} onClick={onClose}>
                  <div className="flex items-center gap-3">
                    <ScrollText className="w-4 h-4 text-primary-200" />
                    <span>Audit Log</span>
                  </div>
                </NavLink>

                <NavLink to="/admin/settings" className={navItemClass} onClick={onClose}>
                  <div className="flex items-center gap-3">
                    <Settings className="w-4 h-4 text-primary-200" />
                    <span>Pengaturan Sistem</span>
                  </div>
                </NavLink>

                <NavLink to="/admin/content" className={navItemClass} onClick={onClose}>
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-primary-200" />
                    <span>Konten & Halaman</span>
                  </div>
                </NavLink>
              </>
            )}
          </div>
        </nav>

        {/* Footer Link to Public Website */}
        <div className="p-3.5 border-t border-white/10 bg-black/10">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-xs"
          >
            <span>Buka Website Publik</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </aside>
    </>
  );
};
