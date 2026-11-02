import { Fuel, Gauge, Settings2, Zap } from 'lucide-react';
import type { Motor } from '../../types';
import { formatNumber } from '../../lib/format';
import { typeLabelMap } from '../../lib/labels';

const typeLabel = typeLabelMap;

/** Ringkasan spesifikasi satu baris (ikon + teks), dipakai di kartu motor. */
export function SpecInline({ motor }: { motor: Motor }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-700">
      <li className="flex items-center gap-1.5">
        <Zap aria-hidden className="h-4 w-4 text-primary-600" />
        {typeLabel[motor.type]}
      </li>
      <li className="flex items-center gap-1.5">
        <Gauge aria-hidden className="h-4 w-4 text-primary-600" />
        {motor.cc} cc
      </li>
      <li className="flex items-center gap-1.5">
        <Settings2 aria-hidden className="h-4 w-4 text-primary-600" />
        {motor.transmission}
      </li>
    </ul>
  );
}

/** Tabel spesifikasi lengkap di halaman detail. */
export function SpecGrid({ motor }: { motor: Motor }) {
  const rows: Array<[string, string]> = [
    ['Merek', motor.brand],
    ['Tipe', typeLabel[motor.type]],
    ['Kapasitas mesin', `${motor.cc} cc`],
    ['Transmisi', motor.transmission],
    ['Tahun', String(motor.year)],
    ['Warna', motor.color],
    ['Kapasitas BBM', `${formatNumber(motor.fuelCapacity)} liter`],
    ['Plat nomor', motor.plate],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between border-b border-neutral-200 py-3 text-sm">
          <dt className="flex items-center gap-2 text-neutral-500">
            {k === 'Kapasitas BBM' && <Fuel aria-hidden className="h-4 w-4" />}
            {k}
          </dt>
          <dd className="font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
