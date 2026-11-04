import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Bike,
  MapPin,
  Clock,
  ShieldCheck,
  CreditCard,
  MessageSquare,
  Send,
  CheckCircle2,
  Key,
  RotateCcw,
  Ban,
  AlertCircle,
  Printer,
  AlertTriangle,
  PhoneCall,
  X,
  Check,
  History,
  Navigation2,
  ExternalLink,
  Banknote,
  Store,
  Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { AdminBooking } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { TimelineList } from '../components/TimelineList';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { usePermission } from '../hooks/usePermission';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';
import {
  RentalCountdownCard,
  computeRentalTimer,
  formatDateTimeID,
} from '../../components/booking/RentalCountdownCard';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/api\/?$/, '');

function resolvePhotoUrl(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return `${API_BASE_URL}/${url.replace(/^\/+/, '')}`;
}

export const BookingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, role } = usePermission();

  const [booking, setBooking] = useState<AdminBooking | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New Note State
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Action Loading
  const [actionLoading, setActionLoading] = useState(false);

  // Modal 1: Konfirmasi Pembayaran Manual
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'ewallet'>('transfer');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');

  // Modal 2: Serah Terima Motor (Handover)
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [startOdo, setStartOdo] = useState<number>(10000);
  const [startFuel, setStartFuel] = useState<string>('Penuh (F)');
  const [handoverCondition, setHandoverCondition] = useState('Kondisi motor prima, bodi mulus tanpa lecet baru.');
  const [originalDocsChecked, setOriginalDocsChecked] = useState(false);
  const [depositReceived, setDepositReceived] = useState(false);

  // Modal 3: Pengembalian Motor (Return)
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnTime, setReturnTime] = useState<string>(() => {
    const d = new Date();
    // format as YYYY-MM-DDTHH:mm
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [endOdo, setEndOdo] = useState<number>(10000);
  const [endFuel, setEndFuel] = useState<string>('Penuh (F)');
  const [returnNotes, setReturnNotes] = useState('Unit diterima lengkap.');
  const [damageFee, setDamageFee] = useState<number>(0);
  const [otherFee, setOtherFee] = useState<number>(0);
  const [confirmDepositRefund, setConfirmDepositRefund] = useState<boolean>(true);

  // Modal 4: Pembatalan Booking
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Document verification status
  const [docCheck, setDocCheck] = useState<{ isVerified: boolean; reason?: string }>({
    isVerified: true,
  });
  const [docsComputedStatus, setDocsComputedStatus] = useState<'verified' | 'pending' | 'rejected' | 'not_uploaded'>('not_uploaded');
  const [currentProfile, setCurrentProfile] = useState<any>(null);

  const fetchDetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getBookingById(id);
      setBooking(data);
      setPaymentAmount(data.total ?? data.totalPrice ?? 0);
      setStartOdo(data.startOdometer || 12000);
      setEndOdo(data.endOdometer || (data.startOdometer ? data.startOdometer + 50 : 12050));

      if (data.userId) {
        try {
          const profRes = await adminApi.getUserRenterProfile(data.userId);
          if (profRes && profRes.profile) {
            setCurrentProfile(profRes.profile);
          }
        } catch {
          // ignore
        }
      }

      try {
        const docsRes = await adminApi.getDocuments();
        const userDocs = docsRes.data.filter(
          (d) =>
            d.userId === data.userId ||
            (data.renter?.email && d.userEmail.toLowerCase() === data.renter.email.toLowerCase()),
        );
        if (userDocs.length > 0) {
          const ktp = userDocs.find((d) => d.type === 'ktp');
          const sim = userDocs.find((d) => d.type === 'sim');
          const ktpOk = ktp?.status === 'verified';
          const simOk = sim?.status === 'verified';
          const anyRejected = ktp?.status === 'rejected' || sim?.status === 'rejected';
          const anyPending = ktp?.status === 'pending' || sim?.status === 'pending';

          if (ktpOk && simOk) {
            setDocsComputedStatus('verified');
          } else if (anyRejected) {
            setDocsComputedStatus('rejected');
          } else if (anyPending) {
            setDocsComputedStatus('pending');
          } else {
            setDocsComputedStatus('not_uploaded');
          }

          if (!ktpOk || !simOk) {
            const reasons: string[] = [];
            if (!ktpOk)
              reasons.push(
                `KTP (${ktp ? (ktp.status === 'rejected' ? 'Ditolak' : 'Menunggu Verifikasi') : 'Belum Diunggah'})`,
              );
            if (!simOk)
              reasons.push(
                `SIM C (${sim ? (sim.status === 'rejected' ? 'Ditolak' : 'Menunggu Verifikasi') : 'Belum Diunggah'})`,
              );
            setDocCheck({
              isVerified: false,
              reason: `Dokumen belum terverifikasi: ${reasons.join(', ')}`,
            });
          } else {
            setDocCheck({ isVerified: true });
          }
        } else {
          setDocsComputedStatus('not_uploaded');
          setDocCheck({
            isVerified: false,
            reason: 'Dokumen KTP dan SIM C belum diunggah oleh penyewa.',
          });
        }
      } catch {
        // silent
      }
    } catch (err: any) {
      setError(err.message || 'Pemesanan tidak ditemukan.');
    } finally {
      setLoading(false);
    }
  };

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    fetchDetail();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return registerRefetch(`admin-booking-detail-${id}`, () => {
      fetchDetail();
    });
  }, [registerRefetch, id]);

  useRealtimeSubscription(['booking.updated', 'payment.updated', 'document.updated'], (event) => {
    if (event.type === 'booking.updated' && event.entityId && event.entityId !== id) {
      return;
    }
    fetchDetail();
  });

  // Check if booking is currently overdue (based on 24h handover timer when available)
  const isCurrentlyOverdue = useMemo(() => {
    if (!booking || (booking.status !== 'active' && booking.status !== 'return_requested')) return false;
    const handedAt = booking.handedAt || booking.handoverAt || booking.handover?.at;
    if (handedAt) {
      const days = Math.max(
        1,
        booking.days ||
          Math.ceil(
            (new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
      );
      return computeRentalTimer(handedAt, booking.dueAt, days, booking.pricePerDay).isOverdue;
    }
    const scheduled = new Date(`${booking.endDate}T${booking.pickupTime || '09:00'}:00+07:00`);
    return new Date() > scheduled;
  }, [booking]);

  // Deteksi perbedaan antara snapshot saat booking vs profil pengguna terkini
  const profileDrift = useMemo(() => {
    if (!booking?.renterSnapshot || !currentProfile) return null;
    const snap = booking.renterSnapshot;
    const changes: string[] = [];
    if (snap.fullNameKtp && currentProfile.fullNameKtp && snap.fullNameKtp !== currentProfile.fullNameKtp) {
      changes.push(`Nama KTP: "${snap.fullNameKtp}" -> "${currentProfile.fullNameKtp}"`);
    }
    if (snap.phoneE164 && currentProfile.phoneE164 && snap.phoneE164 !== currentProfile.phoneE164) {
      changes.push(`Nomor Telepon: "${snap.phoneE164}" -> "${currentProfile.phoneE164}"`);
    }
    if (snap.nikLast4 && currentProfile.nikLast4 && snap.nikLast4 !== currentProfile.nikLast4) {
      changes.push(`NIK (4 digit akhir): "...${snap.nikLast4}" -> "...${currentProfile.nikLast4}"`);
    }
    return changes.length > 0 ? changes : null;
  }, [booking?.renterSnapshot, currentProfile]);

  // Calculate live return summary for modal
  const liveReturnCalc = useMemo(() => {
    if (!booking || !returnModalOpen) return null;
    try {
      return adminApi.calculateReturnSummary(
        booking,
        new Date(returnTime).toISOString(),
        Number(damageFee) || 0,
        Number(otherFee) || 0,
      );
    } catch {
      return null;
    }
  }, [booking, returnModalOpen, returnTime, damageFee, otherFee]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || !id) return;
    setSubmittingNote(true);
    try {
      const updated = await adminApi.addBookingNote(id, noteText.trim());
      setBooking(updated);
      setNoteText('');
      toast.success('Catatan berhasil ditambahkan ke riwayat.');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambahkan catatan.');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Submit Manual Payment
  const handleConfirmPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading || !booking) return;
    setActionLoading(true);
    try {
      const updated = await adminApi.confirmPayment(booking.id, paymentMethod, paymentNote);
      setBooking(updated);
      setPaymentModalOpen(false);
      toast.success('Pembayaran manual berhasil dikonfirmasi.', { id: 'booking-action-toast' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengonfirmasi pembayaran.', { id: 'booking-action-toast' });
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Handover
  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading || !booking) return;
    if (!originalDocsChecked) {
      toast.error('Harap centang pemeriksaan fisik dokumen KTP/SIM asli.', { id: 'booking-action-toast' });
      return;
    }
    if (!depositReceived) {
      toast.error('Harap centang konfirmasi penerimaan uang deposit.', { id: 'booking-action-toast' });
      return;
    }
    if (startOdo < 0) {
      toast.error('Odometer awal tidak valid.', { id: 'booking-action-toast' });
      return;
    }

    setActionLoading(true);
    try {
      const updated = await adminApi.handoverMotor(booking.id, {
        startOdometer: Number(startOdo),
        initialFuel: startFuel,
        conditionNotes: handoverCondition,
        originalDocsChecked,
        depositReceived,
      });
      setBooking(updated);
      setHandoverModalOpen(false);
      toast.success('Serah terima motor berhasil dicatat! Status sewa sekarang Aktif.', { id: 'booking-action-toast' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal mencatat serah terima motor.', { id: 'booking-action-toast' });
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Return
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading || !booking) return;

    if (booking.startOdometer && Number(endOdo) < booking.startOdometer) {
      toast.error(`Odometer akhir (${endOdo} km) tidak boleh kurang dari awal (${booking.startOdometer} km).`, { id: 'booking-action-toast' });
      return;
    }

    setActionLoading(true);
    try {
      const updated = await adminApi.returnMotor(booking.id, {
        returnTime: new Date(returnTime).toISOString(),
        endOdometer: Number(endOdo),
        finalFuel: endFuel,
        notes: returnNotes,
        damageFee: Number(damageFee) || 0,
        otherFee: Number(otherFee) || 0,
        confirmDepositRefund,
      });
      setBooking(updated);
      setReturnModalOpen(false);
      toast.success('Pengembalian motor berhasil dicatat dan status sewa Selesai.', { id: 'booking-action-toast' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal mencatat pengembalian motor.', { id: 'booking-action-toast' });
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Cancellation
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading || !booking) return;
    setActionLoading(true);
    try {
      const updated = await adminApi.cancelBooking(booking.id, cancelReason || 'Dibatalkan oleh staf admin');
      setBooking(updated);
      setCancelModalOpen(false);
      toast.success('Booking berhasil dibatalkan.', { id: 'booking-action-toast' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal membatalkan booking.', { id: 'booking-action-toast' });
    } finally {
      setActionLoading(false);
    }
  };

  // Mark Deposit Returned
  const handleMarkDepositRefunded = async () => {
    if (actionLoading || !booking) return;
    setActionLoading(true);
    try {
      const updated = await adminApi.markDepositRefunded(booking.id);
      setBooking(updated);
      toast.success('Deposit berhasil ditandai telah dikembalikan kepada penyewa.', { id: 'booking-action-toast' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal menandai pengembalian deposit.', { id: 'booking-action-toast' });
    } finally {
      setActionLoading(false);
    }
  };

  // Print Receipt
  const handlePrintReceipt = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-500 mt-3">Memuat detail transaksi sewa...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-lg mx-auto mt-10">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900">Transaksi Tidak Ditemukan</h2>
        <p className="text-xs text-gray-500 mt-1">{error || 'ID pemesanan tidak valid.'}</p>
        <Link
          to="/admin/bookings"
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary-900 text-white text-xs font-semibold rounded-lg hover:bg-primary-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Daftar Booking
        </Link>
      </div>
    );
  }

  const isDocVerified = docCheck.isVerified;
  const isPaid = booking.paymentStatus === 'paid';
  const canHandover = isDocVerified && isPaid;

  return (
    <div className="space-y-6">
      {/* Overdue Alert Banner if Booking is Active and Past Scheduled Return */}
      {isCurrentlyOverdue && (
        <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 text-rose-900 flex items-start gap-3 shadow-xs animate-pulse">
          <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-rose-800">PERINGATAN KETERLAMBATAN PENGEMBALIAN</h4>
            <p className="text-xs text-rose-700 mt-0.5">
              Booking ini berstatus <strong>Aktif</strong> namun telah melewati jadwal pengembalian (
              {formatDate(booking.endDate)} jam {booking.pickupTime || '09:00'} WIB). Segera hubungi penyewa untuk konfirmasi posisi unit.
            </p>
          </div>
        </div>
      )}

      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/bookings')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-black text-gray-900 font-mono tracking-tight">
                {booking.code || booking.bookingCode}
              </h1>
              <StatusBadge status={booking.status} />
              {booking.paymentStatus === 'paid' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Lunas
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Dibuat pada {formatDate(booking.createdAt)} • ID: {booking.id}
            </p>
          </div>
        </div>

        {/* Operational Transition Buttons per Status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status: PENDING */}
          {booking.status === 'pending' && can('bookings:confirm_payment') && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setPaymentModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Konfirmasi Pembayaran Manual
            </button>
          )}

          {/* Status: CONFIRMED atau PENDING (Bayar Cash) -> Serah Terima Kunci */}
          {(booking.status === 'confirmed' ||
            (booking.status === 'pending' && booking.paymentMethod === 'cash')) &&
            can('bookings:handover') && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  title="Buka formulir serah terima kunci motor"
                  onClick={() => setHandoverModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  <Key className="w-4 h-4" />
                  Serah Terima Kunci
                </button>
                {!canHandover && (
                  <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>
                      {!isDocVerified
                        ? docCheck.reason
                        : booking.paymentMethod === 'cash'
                        ? 'Bayar Tunai: akan otomatis dilunasi saat Serah Kunci'
                        : 'Menunggu pelunasan pembayaran sewa'}
                    </span>
                  </span>
                )}
              </div>
            )}

          {/* Status: ACTIVE atau RETURN_REQUESTED -> Verifikasi Pengembalian */}
          {(booking.status === 'active' || booking.status === 'return_requested') &&
            can('bookings:return') && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setReturnModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 transition-colors ${
                  booking.status === 'return_requested'
                    ? 'bg-purple-700 hover:bg-purple-800 ring-2 ring-purple-300'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                Verifikasi Pengembalian & Selesaikan Sewa
              </button>
            )}

          {/* Status: COMPLETED */}
          {booking.status === 'completed' && (
            <>
              {!booking.depositReturned ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleMarkDepositRefunded}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Tandai Deposit Sudah Dikembalikan
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold">
                  ✓ Deposit Telah Dikembalikan
                </span>
              )}

              <button
                type="button"
                onClick={handlePrintReceipt}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded-xl text-xs font-semibold shadow-xs transition-colors"
              >
                <Printer className="w-4 h-4" />
                Cetak Bukti Transaksi
              </button>
            </>
          )}

          {/* Cancel button for Pending or Confirmed */}
          {role === 'admin' &&
            (booking.status === 'pending' || booking.status === 'confirmed') && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setCancelModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                Batalkan
              </button>
            )}
        </div>
      </div>

      {/* Alert Aturan Pembayaran Cash & Timer 24 Jam */}
      {booking.paymentMethod === 'cash' && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-amber-950 flex items-start gap-3 shadow-xs">
          <Banknote className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold block text-sm">Aturan Pembayaran Cash / Tunai</span>
            Waktu sewa dihitung 24 jam penuh per hari dimulai sejak waktu Serah Terima Kunci oleh petugas.
          </div>
        </div>
      )}

      {/* Countdown Timer 24 Jam Sejak Serah Terima Kunci */}
      {(booking.status === 'active' || booking.status === 'return_requested') && (
        <RentalCountdownCard
          handedAt={booking.handedAt || booking.handoverAt || booking.handover?.at}
          dueAt={booking.dueAt}
          days={Math.max(
            1,
            booking.days ||
              Math.ceil(
                (new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
          )}
          pricePerDay={booking.pricePerDay}
          paymentMethod={booking.paymentMethod}
        />
      )}

      {/* Kartu Pengajuan Pengembalian Motor dari Pelanggan */}
      {booking.status === 'return_requested' && (
        <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-purple-950">
                  Pengajuan Pengembalian Motor dari Pelanggan
                </h3>
                <p className="text-xs text-purple-800">
                  Diajukan pada {formatDateTimeID(booking.returnRequestedAt || booking.returnRequest?.requestedAt)}
                </p>
              </div>
            </div>
            {can('bookings:return') && (
              <button
                type="button"
                onClick={() => setReturnModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Verifikasi Pengembalian & Selesaikan Sewa
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="bg-white p-3 rounded-xl border border-purple-200">
              <span className="text-[10px] text-purple-700 font-semibold block">Metode Pengembalian</span>
              <div className="flex items-center gap-1.5 font-bold text-gray-900 mt-0.5">
                {(booking.returnMethod || booking.returnRequest?.method) === 'pickup' ? (
                  <>
                    <Truck className="w-4 h-4 text-purple-700" />
                    <span>Minta Jemput Petugas (Pickup)</span>
                  </>
                ) : (
                  <>
                    <Store className="w-4 h-4 text-purple-700" />
                    <span>Kembalikan ke Toko</span>
                  </>
                )}
              </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-purple-200">
              <span className="text-[10px] text-purple-700 font-semibold block">
                Catatan Kondisi / Lokasi Penjemputan
              </span>
              <p className="font-medium text-gray-800 mt-0.5">
                {booking.returnCustomerNotes ||
                  booking.returnRequest?.customerNotes ||
                  'Tidak ada catatan khusus dari pelanggan.'}
              </p>
            </div>
          </div>

          {(booking.returnPhotoUrl || booking.returnRequest?.photoUrl) && (
            <div className="bg-white p-3 rounded-xl border border-purple-200">
              <span className="text-[10px] text-purple-700 font-semibold block mb-1.5">
                Foto Kondisi Motor Saat Dikembalikan (Unggahan Pelanggan)
              </span>
              <img
                src={resolvePhotoUrl(booking.returnPhotoUrl || booking.returnRequest?.photoUrl)}
                alt="Kondisi motor saat pengembalian"
                className="h-44 w-auto rounded-lg border border-gray-200 object-cover"
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Booking Core Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Motor & Rental Schedule */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
              <Bike className="w-4 h-4 text-primary-900" />
              Unit Motor & Jadwal Sewa
            </h3>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="w-28 h-20 rounded-xl bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                <img
                  src={
                    booking.motorImage ||
                    'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=80'
                  }
                  alt={booking.motorName || 'Motor'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-base font-bold text-gray-900">
                    {booking.motorName || `Motor #${booking.motorId}`}
                  </h4>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/rental-history?motorId=${booking.motorId}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 hover:bg-primary-100 text-primary-900 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Lihat Riwayat Sewa Unit Ini</span>
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-400 block font-medium">Mulai Sewa</span>
                    <span className="font-semibold text-gray-800">{formatDate(booking.startDate)}</span>
                    <span className="text-[10px] text-gray-500 block">Jam {booking.pickupTime || '09:00'} WIB</span>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-400 block font-medium">Selesai Sewa</span>
                    <span className="font-semibold text-gray-800">{formatDate(booking.endDate)}</span>
                    <span className="text-[10px] text-gray-500 block">Jam {booking.pickupTime || '09:00'} WIB</span>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-400 block font-medium">Durasi Sewa</span>
                    <span className="font-semibold text-gray-800">
                      {Math.max(
                        1,
                        Math.ceil(
                          (new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) /
                            (1000 * 60 * 60 * 24),
                        ),
                      )}{' '}
                      Hari
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Locations */}
            <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-gray-700">
                <MapPin className="w-4 h-4 text-primary-900 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Lokasi Pengambilan / Antar</span>
                  <span className="font-medium">{booking.pickupAddress || booking.pickupLocation || 'Garasi Utama RodaKita'}</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5 text-gray-700">
                <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Lokasi Pengembalian</span>
                  <span className="font-medium">{booking.returnAddress || booking.returnLocation || 'Garasi Utama RodaKita'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card GPS Tracker: Live Telemetri Unit Motor */}
          {(booking as any).gpsLocation && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <Navigation2 className="w-4 h-4 text-primary-900" />
                  <h3 className="text-sm font-bold text-gray-900">Pelacakan GPS Unit Motor</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      (booking as any).gpsLocation.isOnline
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {(booking as any).gpsLocation.isOnline ? 'Online (Terhubung)' : 'Offline'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/admin/gps')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 hover:bg-primary-100 text-primary-900 rounded-lg text-xs font-semibold transition-colors"
                >
                  <span>Buka Peta GPS Penuh</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-400 block font-medium">Kecepatan</span>
                  <span className="font-semibold text-gray-800">{(booking as any).gpsLocation.speedKmh || 0} km/jam</span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-400 block font-medium">Kontak Mesin</span>
                  <span className={`font-semibold ${(booking as any).gpsLocation.ignition ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {(booking as any).gpsLocation.ignition ? 'Menyala (ON)' : 'Mati (OFF)'}
                  </span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-400 block font-medium">Baterai Tracker</span>
                  <span className="font-semibold text-gray-800">
                    {(booking as any).gpsLocation.batteryPct !== null ? `${(booking as any).gpsLocation.batteryPct}%` : '-'}
                  </span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-400 block font-medium">Pembaruan Terakhir</span>
                  <span className="font-semibold text-gray-800 text-[11px]">
                    {(booking as any).gpsLocation.lastRecordedAt ? new Date((booking as any).gpsLocation.lastRecordedAt).toLocaleTimeString('id-ID') : '-'}
                  </span>
                </div>
              </div>

              {(booking as any).gpsLocation.lat && (booking as any).gpsLocation.lng && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-500 font-medium block">Koordinat Terkini</span>
                    <span className="font-mono text-gray-800 font-semibold">
                      {(booking as any).gpsLocation.lat.toFixed(6)}, {(booking as any).gpsLocation.lng.toFixed(6)}
                    </span>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${(booking as any).gpsLocation.lat},${(booking as any).gpsLocation.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs font-medium shadow-2xs"
                  >
                    Buka di Google Maps
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Card 2: Pelanggan & Kontak Darurat (Sumber Data Tunggal) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <User className="w-4 h-4 text-primary-900" />
                Data Penyewa & Kontak Darurat (Resmi)
              </h3>
              {booking.renterSnapshot && (
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Snapshot Resmi Terkunci
                </span>
              )}
            </div>

            {/* Peringatan jika data profil pengguna berubah setelah pemesanan dibuat */}
            {profileDrift && profileDrift.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold block">
                    Perhatian: Data profil akun pengguna telah diperbarui setelah pemesanan ini dibuat.
                  </span>
                  <ul className="list-disc list-inside mt-1 text-[11px] text-amber-800 space-y-0.5">
                    {profileDrift.map((change, idx) => (
                      <li key={idx}>{change}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Data Identitas Utama */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-gray-400 block text-[10px] font-medium">Nama Penyewa (sesuai KTP)</span>
                <p className="font-semibold text-gray-900 text-sm">
                  {booking.renterSnapshot?.fullNameKtp || booking.renter?.name || booking.userName || 'Pelanggan'}
                </p>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] font-medium">Nomor WhatsApp / Telp</span>
                <p className="font-mono text-gray-800 font-semibold">
                  {booking.renterSnapshot?.phoneE164 || booking.renter?.phone || booking.userPhone || '-'}
                </p>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] font-medium">Email Terdaftar</span>
                <p className="text-gray-700">{booking.renter?.email || booking.userEmail || '-'}</p>
              </div>
            </div>

            {/* Data Tambahan: NIK & Tanggal Lahir */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1 border-t border-gray-100">
              <div>
                <span className="text-gray-400 block text-[10px] font-medium">Nomor Induk Kependudukan (NIK)</span>
                <p className="font-mono text-gray-800 font-semibold">
                  {booking.renterSnapshot?.nikLast4 ? (
                    `•••• •••• •••• ${booking.renterSnapshot.nikLast4}`
                  ) : (
                    <span className="text-gray-400 italic">Belum diisi</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] font-medium">Tanggal Lahir</span>
                <p className="text-gray-800 font-medium">
                  {booking.renterSnapshot?.birthDate ? (
                    formatDate(booking.renterSnapshot.birthDate)
                  ) : (
                    <span className="text-gray-400 italic">Belum diisi</span>
                  )}
                </p>
              </div>
            </div>

            {/* Alamat KTP & Tinggal */}
            {(booking.renterSnapshot?.addressKtp || booking.renterSnapshot?.stayAddress) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-gray-100">
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-400 block font-medium">Alamat Sesuai KTP</span>
                  <p className="text-gray-800 text-[11px] font-medium mt-0.5">
                    {booking.renterSnapshot?.addressKtp || <span className="text-rose-600 italic">Belum diisi</span>}
                  </p>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-400 block font-medium">Alamat Tinggal / Hotel (Bali)</span>
                  <p className="text-gray-800 text-[11px] font-medium mt-0.5">
                    {booking.renterSnapshot?.stayAddress || <span className="text-rose-600 italic">Belum diisi</span>}
                  </p>
                </div>
              </div>
            )}

            {/* Kontak Darurat - Tanpa Data Karangan */}
            {(() => {
              const emContact = booking.renterSnapshot?.emergencyContact || booking.emergencyContact;
              const hasContact = emContact && (emContact.name || emContact.phone);

              return (
                <div
                  className={`rounded-xl p-3 text-xs border ${
                    hasContact
                      ? 'bg-amber-50/70 border-amber-200/80 text-amber-900'
                      : 'bg-rose-50/60 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 font-bold">
                    <PhoneCall className={`w-3.5 h-3.5 ${hasContact ? 'text-amber-700' : 'text-rose-600'}`} />
                    <span>Kontak Darurat (Emergency Contact):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-gray-800">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Nama Kontak</span>
                      {emContact?.name ? (
                        <span className="font-semibold text-gray-900">{emContact.name}</span>
                      ) : (
                        <span className="text-rose-600 font-semibold italic">Belum diisi</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Hubungan / Relasi</span>
                      {emContact?.relation ? (
                        <span className="capitalize font-medium text-gray-800">{emContact.relation}</span>
                      ) : (
                        <span className="text-rose-600 font-semibold italic">Belum diisi</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Nomor Telepon</span>
                      {emContact?.phone ? (
                        <span className="font-mono font-semibold text-gray-900">{emContact.phone}</span>
                      ) : (
                        <span className="text-rose-600 font-semibold italic">Belum diisi</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Status Dokumen Identitas Nyata dengan Tautan Langsung */}
            <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={`w-4 h-4 ${
                    docsComputedStatus === 'verified'
                      ? 'text-emerald-600'
                      : docsComputedStatus === 'rejected'
                      ? 'text-rose-600'
                      : 'text-amber-600'
                  }`}
                />
                <span className="text-gray-800 font-medium">
                  Status Dokumen (KTP & SIM C):{' '}
                  {docsComputedStatus === 'verified' ? (
                    <strong className="text-emerald-700 font-bold">Terverifikasi (Lengkap)</strong>
                  ) : docsComputedStatus === 'pending' ? (
                    <strong className="text-amber-700 font-bold">Menunggu Verifikasi Staf</strong>
                  ) : docsComputedStatus === 'rejected' ? (
                    <strong className="text-rose-700 font-bold">Ditolak</strong>
                  ) : (
                    <strong className="text-rose-600 font-bold">Belum Diunggah</strong>
                  )}
                </span>
              </div>
              <Link
                to={`/admin/documents?search=${encodeURIComponent(
                  booking.renterSnapshot?.fullNameKtp || booking.renter?.name || booking.userName || '',
                )}`}
                className="text-primary-900 font-semibold hover:underline text-xs flex items-center gap-1"
              >
                Lihat di Verifikasi Dokumen &rarr;
              </Link>
            </div>
          </div>

          {/* Card 3: Rincian Harga (Line Items) & Pembayaran */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary-900" />
              Rincian Biaya & Status Pembayaran
            </h3>

            {/* Line Items Breakdown */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-700">
                <span>Biaya Sewa Unit Motor ({booking.startDate} s/d {booking.endDate})</span>
                <span className="font-medium text-gray-900">
                  {formatPrice(booking.subtotal || booking.total || booking.totalPrice || 0)}
                </span>
              </div>

              {booking.addonsList && booking.addonsList.length > 0 && (
                <div className="pl-3 border-l-2 border-blue-400 bg-blue-50/50 p-2 rounded-r-lg space-y-1 text-gray-700">
                  <div className="font-semibold text-blue-900 text-[11px] flex justify-between">
                    <span>Layanan Tambahan (Add-ons):</span>
                    <span>+{formatPrice(booking.addOnsTotal || booking.addonsList.reduce((acc: number, a: any) => acc + (a.amount || a.price || 0), 0))}</span>
                  </div>
                  {booking.addonsList.map((addon: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs text-gray-600 pl-1">
                      <span>• {addon.name} {addon.quantity ? `(${addon.quantity} unit)` : ''}</span>
                      <span>{formatPrice(addon.amount || addon.price || 0)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between text-gray-700">
                <span>Uang Deposit Jaminan (Bukan Pendapatan)</span>
                <span className="font-medium text-gray-900">{formatPrice(booking.deposit || 200000)}</span>
              </div>

              {booking.paymentMethod && (
                <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-100">
                  <span>Metode Pembayaran</span>
                  <span className="font-semibold text-gray-800 uppercase">{booking.paymentMethod}</span>
                </div>
              )}

              {/* Settlement info if completed */}
              {booking.status === 'completed' && booking.returnInfo && (
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1.5 mt-2">
                  <span className="text-[11px] font-bold text-gray-800 block">Kalkulasi Penyelesaian Sewa:</span>
                  {booking.returnInfo.lateFee > 0 && (
                    <div className="flex justify-between text-rose-700">
                      <span>Denda Keterlambatan</span>
                      <span>+ {formatPrice(booking.returnInfo.lateFee)}</span>
                    </div>
                  )}
                  {booking.returnInfo.damageFee > 0 && (
                    <div className="flex justify-between text-rose-700">
                      <span>Biaya Perbaikan / Kerusakan</span>
                      <span>+ {formatPrice(booking.returnInfo.damageFee)}</span>
                    </div>
                  )}
                  {booking.returnInfo.otherFee > 0 && (
                    <div className="flex justify-between text-rose-700">
                      <span>Biaya Tambahan Lainnya</span>
                      <span>+ {formatPrice(booking.returnInfo.otherFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold pt-1 border-t border-gray-200 text-gray-800">
                    <span>Deposit Dikembalikan</span>
                    <span className="text-emerald-700 font-bold">{formatPrice(booking.returnInfo.refundDeposit)}</span>
                  </div>
                  {booking.returnInfo.underpayment > 0 && (
                    <div className="flex justify-between font-bold text-rose-700">
                      <span>Kurang Bayar oleh Penyewa</span>
                      <span>{formatPrice(booking.returnInfo.underpayment)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                <span className="font-bold text-gray-900">Total Transaksi</span>
                <span className="font-black text-primary-900 text-lg">
                  {formatPrice(booking.total ?? booking.totalPrice ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Timeline & Internal Staff Notes */}
        <div className="space-y-6">
          {/* Internal Staff Notes */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary-900" />
              Catatan Internal Staf
            </h3>
            <p className="text-xs text-gray-500">
              Catatan operasional internal (kondisi motor, helm tambahan, atau catatan pengembalian).
            </p>

            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Tulis catatan internal di sini..."
                className="w-full text-xs p-3 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-900"
              />
              <button
                type="submit"
                disabled={submittingNote || !noteText.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-primary-900 hover:bg-primary-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {submittingNote ? 'Menyimpan...' : 'Tambah Catatan'}
              </button>
            </form>
          </div>

          {/* Timeline Riwayat Status */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-900" />
              Riwayat Perjalanan Sewa (Timeline)
            </h3>
            <TimelineList timeline={booking.timeline || []} />
          </div>
        </div>
      </div>

      {/* MODAL 1: Konfirmasi Pembayaran Manual */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Konfirmasi Pembayaran Manual</h3>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmPaymentSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Metode Pembayaran</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                >
                  <option value="cash">Tunai (Cash di Tempat)</option>
                  <option value="transfer">Transfer Bank Manual</option>
                  <option value="ewallet">QRIS / E-Wallet</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Nominal Pembayaran (Rp)</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Contoh: Diterima tunai oleh staf di garasi"
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {actionLoading ? 'Memproses...' : 'Konfirmasi Bayar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Serah Terima Motor (Handover) */}
      {handoverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Formulir Serah Terima Motor</h3>
                <p className="text-[11px] text-gray-500">Unit: {booking.motorName}</p>
              </div>
              <button
                type="button"
                onClick={() => setHandoverModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleHandoverSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Odometer Awal (km)</label>
                  <input
                    type="number"
                    value={startOdo}
                    onChange={(e) => setStartOdo(Number(e.target.value))}
                    min={0}
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Kapasitas Bensin Awal</label>
                  <select
                    value={startFuel}
                    onChange={(e) => setStartFuel(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                  >
                    <option value="Penuh (F)">Penuh (Full)</option>
                    <option value="3/4">3/4 Tangki</option>
                    <option value="1/2">1/2 Tangki</option>
                    <option value="1/4">1/4 Tangki</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Catatan Kondisi Fisik Motor</label>
                <textarea
                  rows={2}
                  value={handoverCondition}
                  onChange={(e) => setHandoverCondition(e.target.value)}
                  placeholder="Kondisi bodi motor, spion, kelengkapan helm..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                />
              </div>

              {/* Checklist Layanan Tambahan (Add-ons) yang dipesan */}
              {booking.addonsList && booking.addonsList.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-1.5">
                  <span className="font-bold text-amber-900 block text-[11px]">
                    📦 Perlengkapan / Add-ons yang Wajib Diserahkan ke Penyewa:
                  </span>
                  <ul className="space-y-1 pl-1">
                    {booking.addonsList.map((addon: any, idx: number) => (
                      <li key={idx} className="flex items-center gap-2 text-amber-800 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                        <span>
                          <strong>{addon.quantity || 1}x {addon.name}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Required Checkboxes */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={originalDocsChecked}
                    onChange={(e) => setOriginalDocsChecked(e.target.checked)}
                    className="mt-0.5 rounded text-primary-900 focus:ring-primary-900"
                    required
                  />
                  <span className="text-gray-800 leading-tight">
                    <strong>Pemeriksaan Fisik KTP & SIM C:</strong> Saya telah memeriksa langsung keaslian fisik KTP dan SIM C milik penyewa.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={depositReceived}
                    onChange={(e) => setDepositReceived(e.target.checked)}
                    className="mt-0.5 rounded text-primary-900 focus:ring-primary-900"
                    required
                  />
                  <span className="text-gray-800 leading-tight">
                    <strong>Penerimaan Deposit Jaminan:</strong> Uang deposit jaminan sebesar{' '}
                    <strong>{formatPrice(booking.deposit || 200000)}</strong> telah diterima dengan benar.
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHandoverModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !originalDocsChecked || !depositReceived}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {actionLoading ? 'Menyimpan...' : 'Konfirmasi Serah Terima'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Pengembalian Motor (Return) */}
      {returnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Formulir Pengembalian Motor</h3>
                <p className="text-[11px] text-gray-500">Unit: {booking.motorName}</p>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Waktu Pengembalian Fisik</label>
                <input
                  type="datetime-local"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Odometer Akhir (Awal: {booking.startOdometer || 0} km)
                  </label>
                  <input
                    type="number"
                    value={endOdo}
                    onChange={(e) => setEndOdo(Number(e.target.value))}
                    min={booking.startOdometer || 0}
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Bensin Akhir</label>
                  <select
                    value={endFuel}
                    onChange={(e) => setEndFuel(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                  >
                    <option value="Penuh (F)">Penuh (Full)</option>
                    <option value="3/4">3/4 Tangki</option>
                    <option value="1/2">1/2 Tangki</option>
                    <option value="1/4">1/4 Tangki</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Biaya Kerusakan (Opsional)</label>
                  <input
                    type="number"
                    value={damageFee}
                    onChange={(e) => setDamageFee(Number(e.target.value))}
                    min={0}
                    step={10000}
                    placeholder="0"
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Biaya Lain-lain (Opsional)</label>
                  <input
                    type="number"
                    value={otherFee}
                    onChange={(e) => setOtherFee(Number(e.target.value))}
                    min={0}
                    step={10000}
                    placeholder="0"
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Catatan Kondisi Unit Saat Kembali</label>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Catatan kebersihan bodi, helm lengkap, dsb."
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                />
              </div>

              {/* Verifikasi Pengembalian Layanan Tambahan (Add-ons) */}
              {booking.addonsList && booking.addonsList.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-1.5">
                  <span className="font-bold text-amber-900 block text-[11px]">
                    📦 Verifikasi Pengembalian Perlengkapan Tambahan (Add-ons):
                  </span>
                  <p className="text-[11px] text-amber-700">Pastikan seluruh item berikut telah diterima kembali:</p>
                  <ul className="space-y-1 pl-1">
                    {booking.addonsList.map((addon: any, idx: number) => (
                      <li key={idx} className="flex items-center gap-2 text-amber-800 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                        <span>
                          <strong>{addon.quantity || 1}x {addon.name}</strong> (Kembali lengkap)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Live Return Financial Calculation Summary */}
              {liveReturnCalc && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="font-bold text-gray-900 border-b border-gray-200 pb-1.5 flex justify-between">
                    <span>Ringkasan Pengembalian Deposit</span>
                    <span>Deposit: {formatPrice(liveReturnCalc.deposit)}</span>
                  </div>

                  {liveReturnCalc.isOverdue && (
                    <div className="flex justify-between text-rose-700 font-medium">
                      <span>Denda Keterlambatan ({liveReturnCalc.lateHours} jam)</span>
                      <span>{formatPrice(liveReturnCalc.lateFee)}</span>
                    </div>
                  )}

                  {liveReturnCalc.damageFee > 0 && (
                    <div className="flex justify-between text-rose-700 font-medium">
                      <span>Biaya Kerusakan</span>
                      <span>{formatPrice(liveReturnCalc.damageFee)}</span>
                    </div>
                  )}

                  {liveReturnCalc.otherFee > 0 && (
                    <div className="flex justify-between text-rose-700 font-medium">
                      <span>Biaya Lainnya</span>
                      <span>{formatPrice(liveReturnCalc.otherFee)}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-sm">
                    {liveReturnCalc.refundDeposit > 0 ? (
                      <>
                        <span className="font-bold text-emerald-800">Uang Deposit Dikembalikan:</span>
                        <span className="font-black text-emerald-700 text-base">
                          {formatPrice(liveReturnCalc.refundDeposit)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-rose-800">Kurang Bayar oleh Penyewa:</span>
                        <span className="font-black text-rose-700 text-base">
                          {formatPrice(liveReturnCalc.underpayment)}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmDepositRefund}
                        onChange={(e) => setConfirmDepositRefund(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-700 focus:ring-emerald-600"
                      />
                      <span className="text-gray-800 leading-tight">
                        <strong>Konfirmasi Pengembalian Deposit Jaminan ({formatPrice(liveReturnCalc.deposit || 200000)}):</strong>{' '}
                        Tandai bahwa pengembalian deposit jaminan kepada pelanggan telah dikonfirmasi dan diselesaikan.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {actionLoading ? 'Menyimpan...' : 'Verifikasi Pengembalian & Selesaikan Sewa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Pembatalan Sewa */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Batalkan Pemesanan Sewa</h3>
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCancelSubmit} className="space-y-4 text-xs">
              <p className="text-gray-600">
                Apakah Anda yakin ingin membatalkan transaksi ini? Status booking akan diubah menjadi{' '}
                <strong className="text-rose-700">cancelled</strong>.
              </p>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Alasan Pembatalan</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Contoh: Permintaan pelanggan via WhatsApp karena cuaca buruk..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !cancelReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {actionLoading ? 'Membatalkan...' : 'Batalkan Transaksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default BookingDetail;
