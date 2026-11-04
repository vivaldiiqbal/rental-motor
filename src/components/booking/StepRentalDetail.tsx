import React from 'react';
import { MapPin, Truck } from 'lucide-react';
import type { BookingDraft, DraftErrors } from './draft';
import type { BookingQuote, Motor } from '../../types';
import { countDays } from '../../lib/format';
import { AddonSelector } from './AddonSelector';

interface Props {
  motor?: Motor;
  draft: BookingDraft;
  errors?: DraftErrors;
  blocked?: Array<{ from: string; to: string }>;
  quote?: BookingQuote | null;
  quoteLoading?: boolean;
  onChange: (patch: Partial<BookingDraft>) => void;
}

export const StepRentalDetail: React.FC<Props> = ({ draft, onChange }) => {
  const rentalDays = draft.startDate && draft.endDate ? Math.max(1, countDays(draft.startDate, draft.endDate)) : 1;

  return (
    <div className="space-y-6">
      {/* 1. Metode Pengambilan Motor */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Metode Pengambilan Motor</h2>
          <p className="text-sm text-neutral-500">
            Pilih apakah Anda ingin mengambil motor langsung di garasi toko atau diantar ke lokasi Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ pickup: 'store' })}
            className={`text-left p-4 rounded-xl border-2 transition ${
              draft.pickup === 'store'
                ? 'border-primary-700 bg-primary-50/40'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
              <MapPin className="w-4 h-4 text-primary-700" /> Ambil di Toko
            </div>
            <div className="text-xs text-slate-600 mt-1">Gratis · Garasi Utama RodaKita</div>
          </button>
          <button
            type="button"
            onClick={() => onChange({ pickup: 'delivery' })}
            className={`text-left p-4 rounded-xl border-2 transition ${
              draft.pickup === 'delivery'
                ? 'border-primary-700 bg-primary-50/40'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
              <Truck className="w-4 h-4 text-primary-700" /> Antar ke Lokasi
            </div>
            <div className="text-xs text-slate-600 mt-1">+ Rp 25.000 · Layanan antar ke hotel / lokasi Anda</div>
          </button>
        </div>

        {draft.pickup === 'delivery' && (
          <div className="mt-3">
            <label htmlFor="delivery-address" className="block text-xs font-semibold text-slate-700 mb-1">
              Alamat Lengkap Pengantaran Motor (Hotel / Jalan / Patokan) <span className="text-rose-600">*</span>
            </label>
            <input
              id="delivery-address"
              type="text"
              value={draft.address || ''}
              onChange={(e) => onChange({ address: e.target.value })}
              placeholder="Contoh: Lobby Hotel Grand Inna Kuta, Jl. Pantai Kuta No. 1"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
        )}
      </div>

      {/* 2. Pemilihan Sewa Lainnya / Layanan Tambahan (Add-ons) */}
      <div className="border-t border-slate-200 pt-6">
        <AddonSelector
          selectedAddons={draft.addons || []}
          onChange={(newAddons) => onChange({ addons: newAddons })}
          rentalDays={rentalDays}
          compact
        />
      </div>
    </div>
  );
};
