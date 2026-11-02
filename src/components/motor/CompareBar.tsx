import { Scale, X } from 'lucide-react';
import { useCompare, MAX_COMPARE } from '../../context/CompareContext';
import { useAsync } from '../../hooks/useAsync';
import { getMotorsByIds } from '../../services/api';
import { Button } from '../ui/Button';
import { SafeImage } from '../ui/SafeImage';

/** Bar bawah: muncul saat ada motor dipilih untuk dibandingkan. */
export function CompareBar() {
  const { ids, toggle, clear } = useCompare();
  const { data } = useAsync(() => getMotorsByIds(ids), [ids.join(',')]);
  if (ids.length === 0) return null;
  const motors = (data ?? []).filter((m) => ids.includes(m.id));

  return (
    <div
      role="region"
      aria-label="Bandingkan motor"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white shadow-md"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Scale aria-hidden className="h-5 w-5 text-primary-600" />
          Bandingkan ({ids.length}/{MAX_COMPARE})
        </div>
        <ul className="flex flex-1 flex-wrap items-center gap-2">
          {motors.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-xl border border-neutral-200 py-1 pl-1 pr-2">
              <SafeImage src={m.images[0]} alt="" wrapperClassName="h-8 w-8 rounded-lg" />
              <span className="max-w-[120px] truncate text-sm">{m.name}</span>
              <button
                type="button"
                onClick={() => toggle(m.id)}
                aria-label={`Hapus ${m.name} dari perbandingan`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={clear}>
            Kosongkan
          </Button>
          {ids.length >= 2 ? (
            <Button size="sm" to="/compare">
              Bandingkan sekarang
            </Button>
          ) : (
            <Button size="sm" disabled>
              Pilih minimal 2
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
