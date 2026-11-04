import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle, KeyRound, CalendarCheck, Banknote } from 'lucide-react';
import { formatRupiah } from '../../lib/format';

interface RentalCountdownCardProps {
  handedAt?: string | null;
  dueAt?: string | null;
  days: number;
  pricePerDay?: number;
  paymentMethod?: string;
  lateFeePercentPerHour?: number;
  compact?: boolean;
  dark?: boolean;
}

export const computeRentalTimer = (
  handedAt?: string | null,
  dueAt?: string | null,
  days: number = 1,
  pricePerDay: number = 0,
  lateFeePercentPerHour: number = 10,
  nowMs: number = Date.now()
) => {
  const startMs = handedAt ? new Date(handedAt).getTime() : NaN;
  const hasHandover = Number.isFinite(startMs);
  const safeDays = Math.max(1, Number(days || 1));
  const computedDueMs = dueAt
    ? new Date(dueAt).getTime()
    : hasHandover
      ? startMs + safeDays * 24 * 60 * 60 * 1000
      : NaN;

  if (!hasHandover || !Number.isFinite(computedDueMs)) {
    return {
      hasHandover: false,
      startMs: null,
      dueMs: null,
      remainingMs: 0,
      isOverdue: false,
      lateHours: 0,
      estimatedLateFee: 0,
      formattedCountdown: '-',
    };
  }

  const diffMs = computedDueMs - nowMs;
  const isOverdue = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const totalSeconds = Math.floor(absMs / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedCountdown =
    d > 0
      ? `${d} hari ${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(h)}:${pad(m)}:${pad(s)}`;

  // Grace period 15 minutes before charging hourly late fee, matching backend returnService
  const lateMinutes = isOverdue ? Math.floor(absMs / (1000 * 60)) : 0;
  const lateHours = lateMinutes > 15 ? Math.ceil(lateMinutes / 60) : 0;

  let estimatedLateFee = 0;
  if (lateHours > 0 && pricePerDay > 0) {
    const hourlyFee = Math.round(pricePerDay * (lateFeePercentPerHour / 100));
    const fullDaysLate = Math.floor(lateHours / 24);
    const remHours = lateHours % 24;
    const remFee = Math.min(remHours * hourlyFee, pricePerDay);
    estimatedLateFee = fullDaysLate * pricePerDay + remFee;
  }

  return {
    hasHandover: true,
    startMs,
    dueMs: computedDueMs,
    remainingMs: diffMs,
    isOverdue,
    lateMinutes,
    lateHours,
    estimatedLateFee,
    formattedCountdown,
  };
};

export const formatDateTimeID = (msOrIso?: number | string | null) => {
  if (!msOrIso) return '-';
  const d = new Date(msOrIso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const RentalCountdownCard: React.FC<RentalCountdownCardProps> = ({
  handedAt,
  dueAt,
  days,
  pricePerDay = 0,
  paymentMethod,
  lateFeePercentPerHour = 10,
  compact = false,
  dark = false,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timer = computeRentalTimer(handedAt, dueAt, days, pricePerDay, lateFeePercentPerHour, nowMs);
  const isCash = paymentMethod === 'cash';

  if (!timer.hasHandover) {
    if (isCash) {
      return (
        <div
          className={`rounded-xl border p-4 ${
            dark
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <Banknote className={`w-5 h-5 shrink-0 mt-0.5 ${dark ? 'text-amber-400' : 'text-amber-700'}`} />
            <div className="text-xs leading-relaxed">
              <span className="font-bold">Aturan Sewa Bayar Tunai (Cash): </span>
              Waktu sewa dihitung <strong>24 jam penuh per hari</strong> ({days} × 24 jam = {days * 24} jam) dimulai sejak waktu{' '}
              <strong>Serah Terima Kunci</strong> oleh petugas.
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  if (compact) {
    return (
      <div
        className={`rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${
          timer.isOverdue
            ? dark
              ? 'bg-red-500/15 border-red-500/30 text-red-200'
              : 'bg-red-50 border-red-200 text-red-800'
            : dark
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
        }`}
      >
        <div className="flex items-center gap-1.5 font-medium">
          {timer.isOverdue ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          )}
          <span>Batas Kembali: {formatDateTimeID(timer.dueMs)}</span>
        </div>
        <div className="font-mono font-bold">
          {timer.isOverdue ? `Terlambat ${timer.formattedCountdown}` : `Sisa ${timer.formattedCountdown}`}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-5 space-y-4 ${
        timer.isOverdue
          ? dark
            ? 'bg-red-950/30 border-red-500/40 text-slate-100'
            : 'bg-red-50/70 border-red-200 text-slate-900'
          : dark
            ? 'bg-slate-900/90 border-emerald-500/30 text-slate-100'
            : 'bg-emerald-50/50 border-emerald-200 text-slate-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              timer.isOverdue
                ? 'bg-red-500/20 text-red-500'
                : 'bg-emerald-500/20 text-emerald-600'
            }`}
          >
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold">
              Status Waktu Sewa Berjalan ({days} Hari · {days * 24} Jam)
            </h3>
            <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
              Waktu sewa dihitung 24 jam penuh per hari sejak Serah Terima Kunci
            </p>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
            timer.isOverdue
              ? 'bg-red-600 text-white animate-pulse'
              : 'bg-emerald-600 text-white'
          }`}
        >
          {timer.isOverdue ? 'LEWAT BATAS WAKTU' : 'AKTIF BERJALAN'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className={`rounded-lg p-3 border ${
            dark ? 'bg-slate-800/70 border-slate-700' : 'bg-white border-slate-200/80'
          }`}
        >
          <div className={`text-[11px] flex items-center gap-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            <KeyRound className="w-3.5 h-3.5 text-blue-500" /> Waktu Serah Kunci
          </div>
          <div className="text-sm font-bold mt-1">{formatDateTimeID(timer.startMs)}</div>
        </div>

        <div
          className={`rounded-lg p-3 border ${
            dark ? 'bg-slate-800/70 border-slate-700' : 'bg-white border-slate-200/80'
          }`}
        >
          <div className={`text-[11px] flex items-center gap-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            <CalendarCheck className="w-3.5 h-3.5 text-emerald-500" /> Batas Waktu Pengembalian
          </div>
          <div className="text-sm font-bold mt-1">{formatDateTimeID(timer.dueMs)}</div>
        </div>

        <div
          className={`rounded-lg p-3 border ${
            timer.isOverdue
              ? dark
                ? 'bg-red-500/20 border-red-500/40'
                : 'bg-red-100/80 border-red-300'
              : dark
                ? 'bg-emerald-500/15 border-emerald-500/30'
                : 'bg-emerald-100/60 border-emerald-300'
          }`}
        >
          <div className={`text-[11px] font-medium ${timer.isOverdue ? 'text-red-500' : 'text-emerald-600'}`}>
            {timer.isOverdue ? 'Waktu Keterlambatan' : 'Sisa Waktu Sewa'}
          </div>
          <div
            className={`text-base font-mono font-extrabold mt-0.5 ${
              timer.isOverdue
                ? dark
                  ? 'text-red-300'
                  : 'text-red-700'
                : dark
                  ? 'text-emerald-300'
                  : 'text-emerald-800'
            }`}
          >
            {timer.isOverdue ? `+ ${timer.formattedCountdown}` : timer.formattedCountdown}
          </div>
        </div>
      </div>

      {timer.isOverdue && (
        <div
          className={`rounded-lg p-3.5 border flex items-start gap-3 ${
            dark
              ? 'bg-red-500/20 border-red-500/40 text-red-100'
              : 'bg-red-100/90 border-red-300 text-red-900'
          }`}
        >
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1 flex-1">
            <div className="font-bold text-sm">
              Peringatan Keterlambatan Pengembalian Motor
            </div>
            <p>
              Batas waktu sewa 24 jam telah terlewati. Denda keterlambatan berlaku sebesar{' '}
              <strong>{lateFeePercentPerHour}% per jam</strong> dari harga sewa harian (toleransi 15 menit).
            </p>
            {pricePerDay > 0 && (
              <div className="pt-1 font-bold text-sm">
                Estimasi Denda Saat Ini ({timer.lateHours} jam):{' '}
                <span className="underline">{formatRupiah(timer.estimatedLateFee)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
