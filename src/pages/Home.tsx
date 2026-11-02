import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Search, ShieldCheck, Tag, Wrench } from 'lucide-react';
import { Seo } from '../components/Seo';
import { DateRangePicker } from '../components/motor/DateRangePicker';
import type { DateValue } from '../components/motor/DateRangePicker';
import { MotorCard } from '../components/motor/MotorCard';
import { MotorGridSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { Button } from '../components/ui/Button';
import { useAsync } from '../hooks/useAsync';
import { getBlocks, getFeaturedMotors } from '../services/api';
import { site } from '../config/site';
import { dateQuery } from '../lib/links';
import type { ContentBlocks } from '../types';

const steps = [
  { icon: Search, title: 'Pilih motor', desc: 'Cari motor sesuai kebutuhan dan anggaran Anda.' },
  { icon: CalendarCheck, title: 'Tentukan tanggal', desc: 'Pilih tanggal ambil dan kembali, harga langsung terlihat.' },
  { icon: ShieldCheck, title: 'Bayar dan berangkat', desc: 'Konfirmasi pesanan, ambil motor, dan nikmati perjalanan.' },
];

const perks = [
  { icon: Tag, title: 'Harga transparan', desc: 'Tanpa biaya tersembunyi. Deposit dikembalikan penuh.' },
  { icon: Wrench, title: 'Motor terawat', desc: 'Dicek rutin sebelum disewakan agar aman di jalan.' },
  { icon: ShieldCheck, title: 'Pembatalan mudah', desc: `Batal gratis hingga ${site.rental.freeCancelHours} jam sebelum sewa.` },
];

export default function Home() {
  const navigate = useNavigate();
  const [dates, setDates] = useState<DateValue>({});
  const [blocks, setBlocks] = useState<ContentBlocks | null>(null);
  const { data, loading, error, reload } = useAsync(() => getFeaturedMotors(4), []);

  useEffect(() => {
    let active = true;
    getBlocks()
      .then((res) => {
        if (active && res) setBlocks(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const search = () => navigate(`/motors${dateQuery(dates.startDate, dates.endDate)}`);

  return (
    <>
      <Seo
        description={`${site.name}: sewa motor harian mudah dan aman. Pilih motor, tentukan tanggal, dan pesan dalam hitungan menit.`}
      />

      <section className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">
            {blocks?.heroTitle || site.tagline}
          </h1>
          <p className="mt-4 max-w-xl text-base text-neutral-200 sm:text-lg">
            {blocks?.heroSubtitle || 'Pilih motor, tentukan tanggal, dan pesan dalam beberapa menit. Harga jelas sejak awal.'}
          </p>
          <div className="mt-8 max-w-2xl rounded-xl bg-white p-3 shadow-md sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <DateRangePicker value={dates} onChange={setDates} className="flex-1 text-ink" />
              <Button size="lg" onClick={search} leftIcon={<Search aria-hidden className="h-5 w-5" />}>
                {blocks?.ctaText || 'Cari Motor'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="populer">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="populer" className="text-2xl font-bold text-ink">
              Motor populer
            </h2>
            <p className="text-sm text-neutral-500">Paling sering dipilih penyewa kami.</p>
          </div>
          <Button to="/motors" variant="secondary">
            Lihat semua
          </Button>
        </div>
        {loading && <MotorGridSkeleton count={4} />}
        {error && <ErrorState onRetry={reload} />}
        {data && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {data.map((m) => (
              <MotorCard key={m.id} motor={m} hideCompare />
            ))}
          </div>
        )}
      </section>

      <section className="bg-white py-14" aria-labelledby="cara">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="cara" className="text-center text-2xl font-bold text-ink">
            Sewa motor dalam 3 langkah
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="rounded-xl border border-neutral-200 p-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-white">
                    <Icon aria-hidden className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-ink">
                    {i + 1}. {s.title}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">{s.desc}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="alasan">
        <h2 id="alasan" className="text-2xl font-bold text-ink">
          Kenapa memilih {site.name}
        </h2>
        <ul className="mt-6 grid gap-6 md:grid-cols-3">
          {perks.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.title} className="card flex gap-4 p-5">
                <Icon aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-primary-600" />
                <div>
                  <h3 className="font-semibold text-ink">{p.title}</h3>
                  <p className="mt-1 text-sm text-neutral-500">{p.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
