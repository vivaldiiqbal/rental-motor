import { Link } from 'react-router-dom';
import { Scale, X } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { SafeImage } from '../components/ui/SafeImage';
import { RatingStars } from '../components/ui/RatingStars';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAsync } from '../hooks/useAsync';
import { useCompare } from '../context/CompareContext';
import { getMotorsByIds } from '../services/api';
import { formatNumber, formatRupiah } from '../lib/format';
import { typeLabelMap } from '../lib/labels';
import type { Motor } from '../types';

const rows: Array<[string, (m: Motor) => string]> = [
  ['Harga per hari', (m) => formatRupiah(m.pricePerDay)],
  ['Deposit', (m) => formatRupiah(m.deposit)],
  ['Merek', (m) => m.brand],
  ['Tipe', (m) => typeLabelMap[m.type]],
  ['Mesin', (m) => `${m.cc} cc`],
  ['Transmisi', (m) => m.transmission],
  ['Tahun', (m) => String(m.year)],
  ['Kapasitas BBM', (m) => `${formatNumber(m.fuelCapacity)} liter`],
  ['Status', (m) => (m.status === 'available' ? 'Tersedia' : 'Sedang perawatan')],
];

export default function Compare() {
  const { ids, toggle, clear } = useCompare();
  const { data, loading, error, reload } = useAsync(() => getMotorsByIds(ids), [ids.join(',')]);
  const motors = (data ?? []).filter((m) => ids.includes(m.id));

  return (
    <PageContainer>
      <Seo title="Bandingkan Motor" description="Bandingkan spesifikasi dan harga beberapa motor sekaligus." />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Bandingkan' }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Bandingkan motor</h1>
        {ids.length > 0 && (
          <Button variant="secondary" onClick={clear}>
            Kosongkan
          </Button>
        )}
      </div>

      <div className="mt-6">
        {ids.length < 2 ? (
          <EmptyState
            icon={<Scale aria-hidden className="h-6 w-6" />}
            title="Pilih minimal 2 motor"
            description="Centang 'Bandingkan' pada kartu motor untuk melihat perbedaannya berdampingan."
            action={<Button to="/motors">Pilih motor</Button>}
          />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : loading && !data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">Perbandingan spesifikasi motor</caption>
              <thead>
                <tr>
                  <td className="w-40 p-4" />
                  {motors.map((m) => (
                    <th key={m.id} scope="col" className="p-4 text-left align-top font-normal">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => toggle(m.id)}
                          aria-label={`Hapus ${m.name}`}
                          className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm"
                        >
                          <X aria-hidden className="h-4 w-4" />
                        </button>
                        <SafeImage src={m.images[0]} alt={`Foto ${m.name}`} wrapperClassName="aspect-[4/3] w-full rounded-xl" />
                      </div>
                      <Link to={`/motors/${m.slug}`} className="mt-3 block text-base font-semibold text-ink hover:text-primary-600">
                        {m.name}
                      </Link>
                      <RatingStars value={m.rating} count={m.reviewCount} size={14} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, get]) => (
                  <tr key={label} className="border-t border-neutral-200">
                    <th scope="row" className="p-4 text-left font-medium text-neutral-500">
                      {label}
                    </th>
                    {motors.map((m) => (
                      <td key={m.id} className="p-4 text-ink">
                        {get(m)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-neutral-200">
                  <td className="p-4" />
                  {motors.map((m) => (
                    <td key={m.id} className="p-4">
                      <Button to={`/motors/${m.slug}`} size="sm">
                        Lihat Detail
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
