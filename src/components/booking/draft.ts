import { isBefore, isEqual, startOfDay } from 'date-fns';
import type { PaymentMethod, PickupMethod, User } from '../../types';
import { site } from '../../config/site';
import { countDays, parseDate } from '../../lib/format';

export const BOOKING_STEPS = ['Detail Sewa', 'Data Penyewa', 'Pembayaran'] as const;

export interface BookingDraft {
  startDate?: string;
  endDate?: string;
  pickup: PickupMethod;
  name: string;
  phone: string;
  email: string;
  idNumber: string;
  notes: string;
  payment: PaymentMethod;
  agree: boolean;
  promoCode?: string;
  profile?: any;
  readiness?: any;
}

export type DraftErrors = Partial<Record<keyof BookingDraft, string>>;

export function emptyDraft(user: User | null, startDate?: string, endDate?: string): BookingDraft {
  return {
    startDate,
    endDate,
    pickup: 'store',
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    idNumber: '',
    notes: '',
    payment: 'transfer',
    agree: false,
    promoCode: '',
  };
}

export function validateRental(d: BookingDraft, rules?: { minDays?: number; maxDays?: number }): DraftErrors {
  const e: DraftErrors = {};
  const start = parseDate(d.startDate);
  const end = parseDate(d.endDate);
  const minDays = rules?.minDays ?? site.rental.minDays;
  const maxDays = rules?.maxDays ?? site.rental.maxDays;

  if (!start || !end) {
    e.startDate = 'Pilih tanggal ambil dan kembali.';
    return e;
  }

  const today = startOfDay(new Date());
  if (isBefore(start, today)) {
    e.startDate = 'Tanggal mulai sewa tidak boleh di masa lalu.';
    return e;
  }

  if (isBefore(end, start)) {
    e.endDate = 'Tanggal kembali tidak boleh sebelum tanggal ambil.';
    return e;
  }

  if (isEqual(end, start)) {
    e.endDate = `Tanggal kembali harus setelah tanggal ambil (minimal sewa ${minDays} hari).`;
    return e;
  }

  const days = countDays(d.startDate, d.endDate);
  if (days < minDays) {
    e.endDate = `Durasi sewa minimal ${minDays} hari.`;
    return e;
  }
  if (days > maxDays) {
    e.endDate = `Durasi sewa maksimal ${maxDays} hari (Anda memilih ${days} hari).`;
    return e;
  }

  return e;
}

export function validateRenter(d: BookingDraft): DraftErrors {
  const e: DraftErrors = {};
  if (d.readiness && !d.readiness.isReady) {
    if (d.readiness.missingFields && d.readiness.missingFields.length > 0) {
      e.name = 'Profil penyewa belum lengkap. Silakan klik "Ubah di profil" untuk melengkapi data Anda.';
    } else {
      e.name = 'Dokumen identitas Anda belum terverifikasi oleh staf.';
    }
    return e;
  }
  if (!d.name || d.name.trim().length < 3) {
    e.name = 'Profil penyewa belum lengkap.';
  }
  return e;
}

export function validatePayment(d: BookingDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.agree) e.agree = 'Anda harus menyetujui syarat dan ketentuan.';
  return e;
}
