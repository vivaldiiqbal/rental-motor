import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Wrench,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import { id } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { adminApi } from '../services/adminApi';
import type { Motor } from '../../types';
import type { AdminBooking, MaintenanceBlock } from '../types';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { useRealtime } from '../../context/RealtimeContext';

export const Calendar: React.FC = () => {
  const navigate = useNavigate();

  const [motors, setMotors] = useState<Motor[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceBlock[]>([]);
  const [loading, setLoading] = useState(true);

  // Month Navigation
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Quick Maintenance Modal for Empty Cell Click
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [selectedMotorId, setSelectedMotorId] = useState<string>('');
  const [maintStartDate, setMaintStartDate] = useState<string>('');
  const [maintEndDate, setMaintEndDate] = useState<string>('');
  const [maintReason, setMaintReason] = useState<string>('Servis Rutin Berkala');
  const [submittingMaint, setSubmittingMaint] = useState(false);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const fetchCalendarData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [motorsRes, bookingsRes, maintRes] = await Promise.all([
        adminApi.getMotors({ limit: 100 }),
        adminApi.getBookings({ limit: 200 }),
        adminApi.getMaintenanceBlocks({ limit: 100 }),
      ]);
      setMotors(motorsRes.data);
      setBookings(bookingsRes.data);
      setMaintenance(maintRes.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData, currentMonth]);

  useEffect(() => {
    return registerRefetch('admin-calendar', () => {
      fetchCalendarData();
    });
  }, [registerRefetch, fetchCalendarData]);

  useRealtimeSubscription(['booking.updated', 'motor.availability.changed'], () => {
    fetchCalendarData();
  });

  const handlePrevMonth = () => setCurrentMonth((d) => subMonths(d, 1));
  const handleNextMonth = () => setCurrentMonth((d) => addMonths(d, 1));
  const handleCurrentMonth = () => setCurrentMonth(new Date());

  // Click on empty cell to schedule maintenance
  const handleCellClick = (motor: Motor, day: Date, existingStatus: any) => {
    if (existingStatus) {
      if (existingStatus.type === 'booking') {
        navigate(`/admin/bookings/${existingStatus.data.id}`);
      } else if (existingStatus.type === 'maintenance') {
        navigate('/admin/maintenance');
      }
      return;
    }

    // Open quick maintenance form
    const dateStr = format(day, 'yyyy-MM-dd');
    setSelectedMotorId(motor.id);
    setMaintStartDate(dateStr);
    setMaintEndDate(dateStr);
    setMaintReason('Servis Rutin Berkala');
    setMaintModalOpen(true);
  };

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMotorId || !maintStartDate || !maintEndDate) {
      toast.error('Harap lengkapi semua kolom form.');
      return;
    }

    setSubmittingMaint(true);
    try {
      await adminApi.createMaintenanceBlock({
        motorId: selectedMotorId,
        startDate: maintStartDate,
        endDate: maintEndDate,
        reason: maintReason,
      });
      toast.success('Jadwal blok servis berhasil ditambahkan.');
      setMaintModalOpen(false);
      fetchCalendarData();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambahkan jadwal servis.');
    } finally {
      setSubmittingMaint(false);
    }
  };

  // Helper to check status of a motor on a specific day
  const getDayStatus = (motorId: string, day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');

    // 1. Check Maintenance Block
    const maint = maintenance.find(
      (m) =>
        (m.motorId === motorId || m.motorcycleId === motorId) &&
        m.status === 'scheduled' &&
        dayStr >= m.startDate &&
        dayStr <= m.endDate,
    );
    if (maint) {
      return {
        type: 'maintenance',
        label: `Servis: ${maint.reason}`,
        data: maint,
      };
    }

    // 2. Check Booking (pending, confirmed, active, completed)
    const booking = bookings.find(
      (b) =>
        b.motorId === motorId &&
        ['pending', 'confirmed', 'active'].includes(b.status) &&
        dayStr >= b.startDate &&
        dayStr <= b.endDate,
    );

    if (booking) {
      return {
        type: 'booking',
        status: booking.status,
        code: booking.code || booking.bookingCode || '',
        renter: booking.renter?.name || booking.userName || 'Penyewa',
        data: booking,
      };
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary-900" />
            Timeline Kalender Armada (1 Bulan)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Visualisasi jadwal sewa dan blok servis per unit motor. Klik blok untuk membuka detail, atau klik kotak kosong untuk menjadwalkan servis bengkel.
          </p>
        </div>

        {/* Month Navigator */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCurrentMonth}
            className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl shadow-xs"
          >
            Bulan Ini
          </button>
          <div className="flex items-center bg-white border border-gray-300 rounded-xl shadow-xs p-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-gray-100 text-gray-600 rounded-lg"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 text-xs font-black text-gray-900 capitalize min-w-[130px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: id })}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-gray-100 text-gray-600 rounded-lg"
              title="Bulan Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 bg-white px-4 py-3 rounded-xl border border-gray-200 text-xs text-gray-600 shadow-xs">
        <span className="font-bold text-gray-800">Keterangan:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-emerald-500 shadow-xs" />
          <span>Sewa Aktif</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-blue-500 shadow-xs" />
          <span>Dikonfirmasi</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-amber-500 shadow-xs" />
          <span>Menunggu Bayar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border border-gray-400 bg-[repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb_4px,#d1d5db_4px,#d1d5db_8px)] shadow-xs" />
          <span>Servis / Bengkel (Abu-abu Bergaris)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border border-gray-200 bg-white" />
          <span>Tersedia (Klik untuk Jadwalkan Servis)</span>
        </div>
      </div>

      {/* Timeline Grid (Rows: Motors x Columns: Days of Month) */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-3 border-primary-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500 mt-2">Memuat jadwal kalender sewa...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 z-20 bg-gray-50 p-3 text-left font-bold text-gray-900 border-r border-gray-200 min-w-[200px] w-[200px] shadow-xs">
                  Armada Motor
                </th>
                {daysInMonth.map((day, idx) => {
                  const today = isToday(day);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <th
                      key={idx}
                      className={`p-1.5 text-center font-bold border-r border-gray-200 min-w-[38px] ${
                        today
                          ? 'bg-blue-100 text-blue-900 font-black'
                          : isWeekend
                          ? 'bg-gray-100/70 text-gray-700'
                          : 'text-gray-600'
                      }`}
                    >
                      <div className="text-[10px] uppercase">{format(day, 'EEE', { locale: id })}</div>
                      <div className="text-xs">{format(day, 'd')}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {motors.map((motor) => (
                <tr key={motor.id} className="hover:bg-gray-50/50 transition-colors">
                  {/* Motor Label Column (Sticky Left) */}
                  <td className="sticky left-0 z-10 bg-white p-2.5 border-r border-gray-200 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                        <img
                          src={
                            motor.images?.[0] ||
                            'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=200&q=80'
                          }
                          alt={motor.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-bold text-gray-900 truncate text-xs">{motor.name}</p>
                        <p className="font-mono text-[10px] text-gray-500 font-semibold">{motor.plate}</p>
                      </div>
                    </div>
                  </td>

                  {/* Day Cells */}
                  {daysInMonth.map((day, dayIdx) => {
                    const st = getDayStatus(motor.id, day);
                    const today = isToday(day);

                    if (!st) {
                      // Empty Cell
                      return (
                        <td
                          key={dayIdx}
                          onClick={() => handleCellClick(motor, day, null)}
                          title={`Klik untuk menjadwalkan servis pada ${format(day, 'd MMM yyyy')}`}
                          className={`p-1 border-r border-gray-100 text-center cursor-pointer hover:bg-blue-50 transition-colors ${
                            today ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <div className="h-9 rounded-md border border-dashed border-transparent hover:border-blue-400" />
                        </td>
                      );
                    }

                    if (st.type === 'maintenance') {
                      // Maintenance Block: Striped Gray
                      return (
                        <td
                          key={dayIdx}
                          onClick={() => handleCellClick(motor, day, st)}
                          title={`${st.label} (Klik untuk buka daftar servis)`}
                          className="p-1 border-r border-gray-100 cursor-pointer"
                        >
                          <div className="h-9 rounded-md border border-gray-400 bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_5px,#e5e7eb_5px,#e5e7eb_10px)] flex items-center justify-center text-gray-700 shadow-xs hover:opacity-80">
                            <Wrench className="w-3.5 h-3.5 text-gray-600" />
                          </div>
                        </td>
                      );
                    }

                    // Booking Block
                    const isPending = st.status === 'pending';
                    const isActive = st.status === 'active';
                    const bgColor = isPending
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : isActive
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700';

                    return (
                      <td
                        key={dayIdx}
                        onClick={() => handleCellClick(motor, day, st)}
                        title={`Booking #${st.code} - ${st.renter} (${st.status}) - Klik untuk lihat detail`}
                        className="p-1 border-r border-gray-100 cursor-pointer"
                      >
                        <div
                          className={`h-9 rounded-md px-1 flex flex-col items-center justify-center text-[10px] font-bold shadow-xs transition-opacity ${bgColor}`}
                        >
                          <span className="font-mono text-[9px] leading-tight truncate w-full text-center">
                            {st.code}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Quick Maintenance Schedule Modal */}
      {maintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-primary-900" />
                  Jadwalkan Servis Bengkel
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Blok ketersediaan unit untuk perawatan berkala
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMaintModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMaintenance} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Unit Motor</label>
                <select
                  value={selectedMotorId}
                  onChange={(e) => setSelectedMotorId(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900 font-semibold"
                  required
                >
                  {motors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.plate})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Mulai Servis</label>
                  <input
                    type="date"
                    value={maintStartDate}
                    onChange={(e) => setMaintStartDate(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Selesai Servis</label>
                  <input
                    type="date"
                    value={maintEndDate}
                    onChange={(e) => setMaintEndDate(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Alasan Servis / Pekerjaan</label>
                <input
                  type="text"
                  value={maintReason}
                  onChange={(e) => setMaintReason(e.target.value)}
                  placeholder="Contoh: Ganti Oli Mesin, Servis CVT, Ganti Kampas Rem"
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-900"
                  required
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <span>
                  Sistem akan otomatis menolak jika jadwal bertabrakan dengan booking aktif atau mendatang.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setMaintModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingMaint}
                  className="px-5 py-2 bg-primary-900 hover:bg-primary-800 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {submittingMaint ? 'Menyimpan...' : 'Simpan Blok Servis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default Calendar;
