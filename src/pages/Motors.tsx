import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { DateRangePicker } from '../components/motor/DateRangePicker';
import { FilterPanel } from '../components/motor/FilterPanel';
import { MotorCard } from '../components/motor/MotorCard';
import { Drawer } from '../components/ui/Drawer';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Pagination } from '../components/ui/Pagination';
import { MotorGridSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { useRealtime } from '../context/RealtimeContext';
import { getMotors } from '../services/api';
import { PAGE_SIZE, activeChips, parseQuery, patchParams, sortOptions } from '../lib/filters';
import type { ParsedQuery } from '../lib/filters';
import type { SortKey } from '../types';

export default function Motors() {
  const [sp, setSp] = useSearchParams();
  const query = parseQuery(sp);
  const chips = activeChips(query);
  const [drawer, setDrawer] = useState(false);

  // Kotak pencarian: debounce 300 ms sebelum masuk URL
  const [qInput, setQInput] = useState(query.q);
  const debouncedQ = useDebounce(qInput, 300);
  const lastPushed = useRef(query.q);

  const update = useCallback(
    (patch: Partial<ParsedQuery>, resetPage = true) => {
      setSp((prev) => patchParams(prev, patch, resetPage), { replace: true });
    },
    [setSp],
  );

  useEffect(() => {
    if (debouncedQ.trim() !== lastPushed.current) {
      lastPushed.current = debouncedQ.trim();
      update({ q: debouncedQ });
    }
  }, [debouncedQ, update]);

  // Sinkronkan input jika URL berubah dari luar (mis. tombol reset)
  useEffect(() => {
    if (query.q !== lastPushed.current) {
      lastPushed.current = query.q;
      setQInput(query.q);
    }
  }, [query.q]);

  const { data, loading, error, reload } = useAsync(
    () =>
      getMotors({
        q: query.q,
        types: query.types,
        brands: query.brands,
        transmission: query.transmission,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        minRating: query.minRating,
        onlyAvailable: query.onlyAvailable,
        sort: query.sort,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page,
        pageSize: PAGE_SIZE,
      }),
    [sp.toString()],
  );

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    return registerRefetch('motors-catalog', () => {
      reload();
    });
  }, [registerRefetch, reload]);

  useRealtimeSubscription(['motor.availability.changed', 'booking.updated'], () => {
    reload();
  });

  const reset = () => {
    setQInput('');
    setSp(
      (prev) => {
        const next = new URLSearchParams();
        const s = prev.get('start');
        const e = prev.get('end');
        if (s && e) {
          next.set('start', s);
          next.set('end', e);
        }
        return next;
      },
      { replace: true },
    );
  };

  const goPage = (page: number) => {
    update({ page }, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeCount = chips.length;
  const hasDates = !!query.startDate && !!query.endDate;

  return (
    <PageContainer>
      <Seo
        title="Pilih Motor"
        description="Jelajahi motor sewa harian: matic, sport, trail, dan manual. Filter berdasarkan harga, merek, dan ketersediaan tanggal."
      />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Pilih Motor' }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Pilih motor</h1>

      <div className="card mt-5 grid gap-3 p-3 md:grid-cols-2">
        <DateRangePicker
          value={{ startDate: query.startDate, endDate: query.endDate }}
          onChange={(v) => update({ startDate: v.startDate, endDate: v.endDate })}
          clearable
        />
        <div className="relative">
          <label htmlFor="cari" className="sr-only">
            Cari motor
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            id="cari"
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Cari nama atau merek motor"
            className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-9 text-sm placeholder:text-neutral-500 hover:border-neutral-500"
          />
          {qInput && (
            <button
              type="button"
              onClick={() => setQInput('')}
              aria-label="Hapus pencarian"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-neutral-500 hover:text-ink"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block" aria-label="Filter">
          <div className="card sticky top-20 p-5">
            <h2 className="mb-4 text-base font-semibold text-ink">Filter</h2>
            <FilterPanel value={query} onChange={(p) => update(p)} onReset={reset} activeCount={activeCount} />
          </div>
        </aside>

        <section aria-label="Hasil pencarian">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-neutral-700" aria-live="polite">
              {loading ? 'Memuat motor…' : data ? `${data.total} motor ditemukan` : ''}
            </p>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                className="lg:hidden"
                onClick={() => setDrawer(true)}
                leftIcon={<SlidersHorizontal aria-hidden className="h-4 w-4" />}
              >
                Filter{activeCount > 0 ? ` (${activeCount})` : ''}
              </Button>
              <div className="w-48">
                <Select
                  label="Urutkan"
                  value={query.sort}
                  onChange={(e) => update({ sort: e.target.value as SortKey })}
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Filter aktif">
              {chips.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => update(c.clear)}
                    aria-label={`Hapus filter ${c.label}`}
                    className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-sm text-neutral-700 hover:bg-neutral-200"
                  >
                    {c.label}
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={reset} className="min-h-[32px] px-2 text-sm font-medium text-primary-600 hover:underline">
                  Reset semua
                </button>
              </li>
            </ul>
          )}

          <div className="mt-6">
            {loading && !data && <MotorGridSkeleton count={6} />}
            {error && <ErrorState onRetry={reload} />}
            {!error && data && data.items.length === 0 && (
              <EmptyState
                title="Tidak ada motor yang cocok"
                description="Coba ubah atau kurangi filter, perluas rentang harga, atau pilih tanggal lain."
                action={<Button onClick={reset}>Reset filter</Button>}
              />
            )}
            {!error && data && data.items.length > 0 && (
              <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {data.items.map((m) => (
                    <MotorCard key={m.id} motor={m} startDate={hasDates ? query.startDate : undefined} endDate={hasDates ? query.endDate : undefined} />
                  ))}
                </div>
                <div className="mt-10">
                  <Pagination page={data.page} pageCount={data.pageCount} onChange={goPage} />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filter"
        side="right"
        footer={
          <Button fullWidth onClick={() => setDrawer(false)}>
            {data ? `Lihat ${data.total} motor` : 'Terapkan'}
          </Button>
        }
      >
        <FilterPanel value={query} onChange={(p) => update(p)} onReset={reset} activeCount={activeCount} />
      </Drawer>
    </PageContainer>
  );
}
