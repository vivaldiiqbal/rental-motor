import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Landmark, Smartphone, Tag, Check, X, Clock } from 'lucide-react';
import type { Motor, PaymentMethod, BookingQuote } from '../../types';
import { Checkbox } from '../ui/Checkbox';
import { cn } from '../../lib/cn';
import type { BookingDraft, DraftErrors } from './draft';

interface Props {
  motor: Motor;
  draft: BookingDraft;
  errors: DraftErrors;
  quote?: BookingQuote | null;
  quoteLoading?: boolean;
  onChange: (patch: Partial<BookingDraft>) => void;
}

const methods: Array<{ value: PaymentMethod; title: string; desc: string; icon: typeof Banknote }> = [
  { value: 'transfer', title: 'Transfer Bank / VA', desc: 'BCA, Mandiri, BNI, BRI (Verifikasi Instan)', icon: Landmark },
  { value: 'ewallet', title: 'QRIS / E-Wallet', desc: 'QRIS, GoPay, OVO, DANA, ShopeePay', icon: Smartphone },
  { value: 'cash', title: 'Bayar Cash / Tunai di Toko', desc: 'Bayar tunai saat serah terima kunci motor', icon: Banknote },
];

export function StepPayment({ draft, errors, quote, quoteLoading = false, onChange }: Props) {
  const [promoInput, setPromoInput] = useState(draft.promoCode || '');

  const applyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = promoInput.trim().toUpperCase();
    onChange({ promoCode: clean });
  };

  const removePromo = () => {
    setPromoInput('');
    onChange({ promoCode: '' });
  };

  return (
    <div className="space-y-6">
      {/* Pilihan Metode Pembayaran */}
      <fieldset>
        <legend className="mb-3 text-lg font-semibold text-ink">Pilih Metode Pembayaran</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {methods.map((m) => {
            const Icon = m.icon;
            const selected = draft.payment === m.value;
            return (
              <label
                key={m.value}
                className={cn(
                  'flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 transition-colors duration-150',
                  selected ? 'border-primary-600 bg-primary-50/40 shadow-sm' : 'border-neutral-300 hover:border-neutral-500',
                )}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={selected}
                  onChange={() => onChange({ payment: m.value })}
                  className="sr-only"
                />
                <Icon aria-hidden className="h-5 w-5 text-primary-600" />
                <span className="font-semibold text-ink">{m.title}</span>
                <span className="text-xs text-neutral-500">{m.desc}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Alert Aturan Pembayaran Cash & Timer 24 Jam Sejak Serah Kunci */}
      {draft.payment === 'cash' && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-2xs"
        >
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold text-amber-950">Aturan Pembayaran Cash / Tunai & Timer 24 Jam</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              Waktu sewa dihitung 24 jam penuh per hari dimulai sejak waktu Serah Terima Kunci oleh petugas.
              Pembayaran sewa beserta deposit jaminan dilakukan langsung saat pengambilan unit.
            </p>
          </div>
        </div>
      )}

      {/* Formulir Kupon / Kode Promo */}
      <section className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink flex items-center gap-1.5">
          <Tag className="w-4 h-4 text-primary-600" />
          Punya Kode Promo / Voucher?
        </h3>
        {draft.promoCode ? (
          <div className="flex items-center justify-between rounded-lg bg-primary-50 border border-primary-200 px-3 py-2 text-xs">
            <span className="font-semibold text-primary-800 flex items-center gap-1">
              <Check className="w-4 h-4 text-primary-600" />
              Kode diterapkan: <span className="underline">{draft.promoCode}</span>
              {quote?.promoDiscount ? ` (Hemat Rp ${quote.promoDiscount.toLocaleString('id-ID')})` : ''}
            </span>
            <button
              type="button"
              onClick={removePromo}
              className="text-danger-600 hover:text-danger-800 font-medium flex items-center gap-0.5"
            >
              <X className="w-3.5 h-3.5" /> Hapus
            </button>
          </div>
        ) : (
          <form onSubmit={applyPromo} className="flex gap-2">
            <input
              type="text"
              placeholder="Contoh: HEMAT10"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              className="flex-1 rounded-xl border border-neutral-300 px-3.5 py-2 text-sm uppercase placeholder:normal-case focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 bg-white"
            />
            <button
              type="submit"
              disabled={!promoInput.trim() || quoteLoading}
              className="rounded-xl bg-primary-900 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-50 transition-colors"
            >
              Terapkan
            </button>
          </form>
        )}
      </section>

      {/* Persetujuan Syarat & Ketentuan */}
      <Checkbox
        checked={draft.agree}
        onChange={(e) => onChange({ agree: e.target.checked })}
        error={errors.agree}
        label={
          <>
            Saya telah memeriksa rincian jadwal & biaya di kartu ringkasan sebelah kanan dan menyetujui{' '}
            <Link to="/terms" target="_blank" className="font-medium text-primary-600 underline">
              Syarat dan Ketentuan
            </Link>{' '}
            serta{' '}
            <Link to="/privacy" target="_blank" className="font-medium text-primary-600 underline">
              Kebijakan Privasi
            </Link>
            .
          </>
        }
      />
    </div>
  );
}
export default StepPayment;
