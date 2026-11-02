import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  Shield,
  CalendarCheck,
  FileCheck2,
  AlertCircle,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import type { AdminUser, AdminBooking, AdminDocument } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';

export const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [userBookings, setUserBookings] = useState<AdminBooking[]>([]);
  const [userDocuments, setUserDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchUserDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const u = await adminApi.getUserById(id);
        setUser(u);

        // Fetch their bookings & documents
        const [bookingsRes, docsRes] = await Promise.all([
          adminApi.getBookings({ search: u.name, limit: 20 }),
          adminApi.getDocuments({ search: u.name, limit: 10 }),
        ]);

        setUserBookings(
          bookingsRes.data.filter(
            (b) => b.userId === u.id || b.renter?.name === u.name || b.userName === u.name,
          ),
        );
        setUserDocuments(
          docsRes.data.filter(
            (d) => d.userId === u.id || d.userName === u.name,
          ),
        );
      } catch (err: any) {
        setError(err.message || 'Pengguna tidak ditemukan.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-500 mt-3">Memuat profil pengguna...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-lg mx-auto mt-10">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900">Pengguna Tidak Ditemukan</h2>
        <p className="text-xs text-gray-500 mt-1">{error || 'ID pengguna tidak valid.'}</p>
        <Link
          to="/admin/users"
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary-900 text-white text-xs font-semibold rounded-lg hover:bg-primary-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Daftar Pengguna
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{user.name}</h1>
            <StatusBadge status={user.role} />
            <StatusBadge status={user.isActive ? 'aktif' : 'nonaktif'} size="sm" />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            ID: <span className="font-mono">{user.id}</span> • Terdaftar sejak {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4">
          Informasi Kontak & Akun
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] text-gray-400 block font-medium">Alamat Email</span>
              <span className="font-semibold text-gray-800">{user.email}</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] text-gray-400 block font-medium">Nomor Telepon / WhatsApp</span>
              <span className="font-semibold text-gray-800 font-mono">{user.phone || '-'}</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-primary-900 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] text-gray-400 block font-medium">Tingkat Hak Akses</span>
              <span className="font-bold text-primary-900 uppercase">{user.role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rental Booking History */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary-900" />
            <h3 className="text-sm font-bold text-gray-900">Riwayat Pemesanan Rental</h3>
          </div>
          <span className="text-xs text-gray-400">{userBookings.length} Transaksi</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 uppercase font-semibold text-gray-500">
              <tr>
                <th className="px-4 py-3">Kode Booking</th>
                <th className="px-4 py-3">Motor</th>
                <th className="px-4 py-3">Periode Sewa</th>
                <th className="px-4 py-3">Total Biaya</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {userBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    Pengguna ini belum pernah melakukan pemesanan.
                  </td>
                </tr>
              ) : (
                userBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold text-primary-900">
                      {b.code || b.bookingCode}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      <Link
                        to={`/admin/rental-history?motorId=${b.motorId}`}
                        title="Lihat seluruh riwayat sewa unit motor ini"
                        className="hover:text-primary-900 hover:underline"
                      >
                        {b.motorName || `Motor #${b.motorId}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(b.startDate)} - {formatDate(b.endDate)}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {formatPrice(b.total ?? b.totalPrice ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/bookings/${b.id}`}
                        className="inline-flex items-center text-primary-900 font-semibold hover:underline"
                      >
                        Lihat &rarr;
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Uploaded Documents */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-primary-900" />
            <h3 className="text-sm font-bold text-gray-900">Dokumen Identitas Terunggah</h3>
          </div>
          <span className="text-xs text-gray-400">{userDocuments.length} Dokumen</span>
        </div>

        <div className="p-5">
          {userDocuments.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Belum ada dokumen yang diunggah.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3 rounded-xl border border-gray-200 bg-gray-50 flex items-center gap-3"
                >
                  <img
                    src={doc.fileUrl}
                    alt={doc.type}
                    className="w-16 h-12 object-cover rounded-lg border border-gray-200"
                  />
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase text-gray-900">{doc.type}</span>
                      <StatusBadge status={doc.status} size="sm" />
                    </div>
                    <p className="font-mono text-gray-600 mt-0.5 truncate">{doc.idNumber || '-'}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(doc.uploadedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default UserDetail;
