import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Landmark, Smartphone, Tag, Check, X } from 'lucide-react';
import type { Motor, PaymentMethod, BookingQuote } from '../../types';
import { Checkbox } from '../ui/Checkbox';
import { PriceSummary } from '../motor/PriceSummary';
import { formatDate } from '../../lib/format';
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
  { value: 'transfer', title: 'Transfer bank', desc: 'BCA, Mandiri, BNI, BRI', icon: Landmark },
  { value: 'ewallet', title: 'E-wallet', desc: 'GoPay, OVO, DANA, ShopeePay', icon: Smartphone },
  { value: 'cash', title: 'Bayar di tempat', desc: 'Tunai saat pengambilan motor', icon: Banknote },
];

export function StepPayment({ motor, draft, errors, quote, quoteLoading = false, onChange }: Props) {
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
        <legend className="mb-3 text-lg font-semibold text-ink">Metode pembayaran</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {methods.map((m) => {
            const Icon = m.icon;
            const selected = draft.payment === m.value;
            return (
              <label
                key={m.value}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors duration-150',
                  selected ? 'border-primary-600 bg-neutral-50 shadow-sm' : 'border-neutral-300 hover:border-neutral-500',
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
                <span className="font-medium text-ink">{m.title}</span>
                <span className="text-xs text-neutral-500">{m.desc}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

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
              {quote?.promoDiscount ? ` (Hemat ${quote.promoDiscount.toLocaleString('id-ID')})` : ''}
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
              placeholder="Contoh: PROMOHEMAT"
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

      {/* Ringkasan Pesanan Dinamis */}
      <section className="rounded-xl bg-neutral-50 p-4 border border-neutral-200/70">
        <h3 className="mb-1 font-semibold text-ink">Ringkasan Tagihan & Transaksi</h3>
        <p className="mb-3 text-xs text-neutral-500">
          {motor.name} · {formatDate(draft.startDate)} - {formatDate(draft.endDate)}
        </p>
        <PriceSummary
          pricePerDay={motor.pricePerDay}
          days={quote?.days || 1}
          deposit={motor.deposit}
          quote={quote}
          loading={quoteLoading}
        />
      </section>

      {/* Persetujuan Syarat & Ketentuan */}
      <Checkbox
        checked={draft.agree}
        onChange={(e) => onChange({ agree: e.target.checked })}
        error={errors.agree}
        label={
          <>
            Saya menyetujui{' '}
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
