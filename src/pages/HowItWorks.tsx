import { useEffect, useState } from 'react';
import { CalendarCheck, FileCheck2, KeyRound, Search, Wallet } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { Accordion } from '../components/ui/Accordion';
import { Button } from '../components/ui/Button';
import { SafeHtml } from '../components/common/SafeHtml';
import { site } from '../config/site';
import { getFaqs, getPage } from '../services/api';
import type { FaqItem, PageContent } from '../types';

const defaultSteps = [
  { icon: Search, title: 'Pilih motor', desc: 'Jelajahi daftar motor, gunakan filter, dan bandingkan pilihan.' },
  { icon: CalendarCheck, title: 'Tentukan tanggal', desc: 'Pilih tanggal ambil dan kembali. Harga total langsung dihitung.' },
  { icon: FileCheck2, title: 'Isi data dan konfirmasi', desc: 'Lengkapi data penyewa, pilih pembayaran, lalu konfirmasi pesanan.' },
  { icon: Wallet, title: 'Bayar', desc: 'Selesaikan pembayaran sesuai metode yang dipilih.' },
  { icon: KeyRound, title: 'Ambil motor', desc: 'Tunjukkan kode booking, KTP, dan SIM saat pengambilan.' },
];

const fallbackFaqs = [
  { title: 'Apakah deposit dikembalikan?', content: 'Ya. Deposit dikembalikan penuh saat motor dikembalikan tepat waktu dan dalam kondisi baik.' },
  { title: 'Bagaimana jika terlambat mengembalikan?', content: `Dikenakan denda ${site.rental.lateFeePercentPerHour}% dari harga harian untuk setiap jam keterlambatan.` },
  { title: 'Bisakah membatalkan pesanan?', content: `Bisa. Pembatalan gratis paling lambat ${site.rental.freeCancelHours} jam sebelum sewa dimulai, lewat halaman Booking Saya.` },
  { title: 'Apakah helm disediakan?', content: 'Ya, setiap motor dilengkapi helm sesuai kapasitas penumpang tanpa biaya tambahan.' },
];

export default function HowItWorks() {
  const [page, setPage] = useState<PageContent | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);

  useEffect(() => {
    let active = true;
    getPage('how-it-works')
      .then((data) => {
        if (active && data) setPage(data);
      })
      .catch(() => {});

    getFaqs()
      .then((items) => {
        if (active && items) setFaqs(items);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const accordionItems =
    faqs.length > 0
      ? faqs.map((f) => ({
          title: f.question,
          content: <SafeHtml html={f.answerHtml} />,
        }))
      : fallbackFaqs;

  return (
    <PageContainer narrow>
      <Seo title={page?.title || 'Cara Sewa'} description={`Langkah mudah sewa motor di ${site.name} dan persyaratan yang perlu disiapkan.`} />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: page?.title || 'Cara Sewa' }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{page?.title || 'Cara sewa motor'}</h1>
      <p className="mt-2 text-neutral-500">Lima langkah sederhana dari memilih motor sampai berangkat.</p>

      {page?.bodyHtml && (
        <div className="mt-6 mb-8 card p-6 bg-primary-50/40 border border-primary-100">
          <SafeHtml html={page.bodyHtml} />
        </div>
      )}

      <ol className="mt-8 space-y-4">
        {defaultSteps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="card flex gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
                <Icon aria-hidden className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-semibold text-ink">
                  {i + 1}. {s.title}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">{s.desc}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="mt-10" aria-labelledby="syarat">
        <h2 id="syarat" className="text-xl font-bold text-ink">
          Persyaratan
        </h2>
        <ul className="card mt-4 divide-y divide-neutral-200">
          {site.rental.requirements.map((r) => (
            <li key={r} className="flex items-center gap-3 p-4 text-sm text-neutral-700">
              <FileCheck2 aria-hidden className="h-5 w-5 shrink-0 text-success-600" />
              {r}
            </li>
          ))}
        </ul>
      </section>

      {accordionItems.length > 0 && (
        <section className="mt-10" aria-labelledby="faq">
          <h2 id="faq" className="mb-4 text-xl font-bold text-ink">
            Pertanyaan umum
          </h2>
          <Accordion items={accordionItems} />
        </section>
      )}

      <div className="mt-10 text-center">
        <Button to="/motors" size="lg">
          Mulai pilih motor
        </Button>
      </div>
    </PageContainer>
  );
}
