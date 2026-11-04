import React from 'react';
import { PackagePlus, Plus, Minus, Shield, CloudRain, Smartphone, Sparkles } from 'lucide-react';
import type { PublicAddon, CartAddonItem } from '../../types';
import { getPublicAddons } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { formatRupiah } from '../../lib/format';
import { useBookingCart } from '../../context/BookingCartContext';

interface AddonSelectorProps {
  selectedAddons?: CartAddonItem[];
  onChange?: (addons: CartAddonItem[]) => void;
  rentalDays?: number;
  title?: string;
  description?: string;
  compact?: boolean;
}

function getAddonIcon(codeOrName: string) {
  const lower = codeOrName.toLowerCase();
  if (lower.includes('helm') || lower.includes('helmet')) {
    return <Shield className="w-5 h-5 text-blue-600 shrink-0" />;
  }
  if (lower.includes('hujan') || lower.includes('rain')) {
    return <CloudRain className="w-5 h-5 text-indigo-600 shrink-0" />;
  }
  if (lower.includes('hp') || lower.includes('phone') || lower.includes('holder')) {
    return <Smartphone className="w-5 h-5 text-amber-600 shrink-0" />;
  }
  return <PackagePlus className="w-5 h-5 text-primary-600 shrink-0" />;
}

export const AddonSelector: React.FC<AddonSelectorProps> = ({
  selectedAddons: controlledAddons,
  onChange,
  rentalDays: propDays,
  title = 'Sewa Lainnya / Layanan Tambahan (Add-ons)',
  description = 'Pilih perlengkapan tambahan untuk kenyamanan & keamanan berkendara Anda.',
  compact = false,
}) => {
  const cart = useBookingCart();

  const isControlled = Array.isArray(controlledAddons) && typeof onChange === 'function';
  const activeAddons = isControlled ? controlledAddons : cart.addons;
  const days = propDays !== undefined && propDays > 0 ? propDays : cart.rentalDays || 1;

  const { data: addonsList, loading } = useAsync(() => getPublicAddons(), []);
  const addons = addonsList || [];

  const getQty = (item: PublicAddon): number => {
    const key = String(item.addon_id ?? item.id);
    const code = String(item.code || key);
    const found = activeAddons.find(
      (a) => String(a.addon_id) === key || String(a.code) === code,
    );
    return found ? found.quantity : 0;
  };

  const updateItemQty = (item: PublicAddon, newQty: number) => {
    const key = String(item.addon_id ?? item.id);
    const code = String(item.code || key);
    const pricePerDay = Number(item.pricePerDay ?? item.price_per_day ?? 0);

    if (isControlled) {
      let next: CartAddonItem[];
      if (newQty <= 0) {
        next = activeAddons.filter(
          (a) => String(a.addon_id) !== key && String(a.code) !== code,
        );
      } else {
        const idx = activeAddons.findIndex(
          (a) => String(a.addon_id) === key || String(a.code) === code,
        );
        const safeQty = Math.min(20, Math.max(1, newQty));
        if (idx >= 0) {
          next = [...activeAddons];
          next[idx] = { ...next[idx], quantity: safeQty };
        } else {
          next = [
            ...activeAddons,
            {
              addon_id: key,
              code,
              name: item.name,
              price_per_day: pricePerDay,
              quantity: safeQty,
              description: item.description,
            },
          ];
        }
      }
      onChange(next);
      // Sync to global cart as well
      if (newQty <= 0) {
        cart.removeAddon(key);
      } else {
        cart.updateAddonQty(key, newQty);
        if (!cart.hasAddon(key)) {
          cart.addAddon(item, newQty);
        }
      }
    } else {
      if (newQty <= 0) {
        cart.removeAddon(key);
      } else if (cart.hasAddon(key)) {
        cart.updateAddonQty(key, newQty);
      } else {
        cart.addAddon(item, newQty);
      }
    }
  };

  if (loading && (!addons || addons.length === 0)) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="h-28 bg-slate-100 rounded-xl" />
          <div className="h-28 bg-slate-100 rounded-xl" />
          <div className="h-28 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? '' : 'bg-white rounded-xl border border-slate-200 p-5'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-primary-700" />
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full border border-primary-200">
            <Sparkles className="w-3 h-3" />
            Tarif Dihitung per Hari ({days} hari)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {addons.map((item) => {
          const qty = getQty(item);
          const isSelected = qty > 0;
          const pricePerDay = Number(item.pricePerDay ?? item.price_per_day ?? 0);
          const itemTotal = pricePerDay * qty * days;

          return (
            <div
              key={String(item.id || item.code)}
              className={`flex flex-col justify-between rounded-xl p-3.5 border-2 transition relative ${
                isSelected
                  ? 'border-primary-600 bg-primary-50/40 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected ? 'bg-primary-100 text-primary-800' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {getAddonIcon(item.name || item.code)}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{item.name}</h4>
                      <p className="text-xs font-semibold text-primary-700 mt-0.5">
                        {formatRupiah(pricePerDay)} <span className="text-[10px] text-slate-500 font-normal">/ hari</span>
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {item.description || 'Layanan tambahan resmi RodaKita.'}
                </p>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                {isSelected ? (
                  <>
                    <div className="text-[11px] font-bold text-slate-800">
                      Total: <span className="text-primary-700">{formatRupiah(itemTotal)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white border border-primary-300 rounded-lg p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => updateItemQty(item, qty - 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition"
                        title="Kurangi jumlah"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <span className="w-6 text-center text-xs font-bold text-slate-900 select-none">
                        {qty}
                      </span>

                      <button
                        type="button"
                        onClick={() => updateItemQty(item, qty + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-primary-600 hover:bg-primary-700 text-white transition"
                        title="Tambah jumlah"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateItemQty(item, 1)}
                    className="w-full h-8 px-3 rounded-lg border border-primary-600 text-primary-700 hover:bg-primary-50 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah ke Sewa
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
