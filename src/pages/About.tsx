import { useEffect, useState } from 'react';
import { HeartHandshake, ShieldCheck, Wrench } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { Button } from '../components/ui/Button';
import { SafeHtml } from '../components/common/SafeHtml';
import { site } from '../config/site';
import { getPage } from '../services/api';
import type { PageContent } from '../types';

const values = [
  { icon: ShieldCheck, title: 'Aman dan terpercaya', desc: 'Setiap motor dicek sebelum disewakan dan dilengkapi helm.' },
  { icon: Wrench, title: 'Terawat rutin', desc: 'Servis berkala agar nyaman dan aman di perjalanan.' },
  { icon: HeartHandshake, title: 'Pelayanan ramah', desc: 'Tim kami siap membantu lewat WhatsApp selama jam operasional.' },
];

export default function About() {
  const [page, setPage] = useState<PageContent | null>(null);

  useEffect(() => {
    let active = true;
    getPage('about')
      .then((data) => {
        if (active && data?.bodyHtml) setPage(data);
      })
      .catch(() => {
        // fallback
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageContainer narrow>
      <Seo title={page?.title || 'Tentang Kami'} description={`Kenali ${site.name}, layanan sewa motor harian yang mudah dan transparan.`} />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: page?.title || 'Tentang' }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{page?.title || `Tentang ${site.name}`}</h1>

      {page ? (
        <div className="mt-4">
          <SafeHtml html={page.bodyHtml} />
        </div>
      ) : (
        <p className="mt-4 leading-relaxed text-neutral-700">
          {site.name} hadir agar menyewa motor semudah memesan tiket. Kami percaya perjalanan yang baik dimulai dari proses sewa yang
          jelas: harga transparan, motor terawat, dan pelayanan yang ramah.
        </p>
      )}

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {values.map((v) => {
          const Icon = v.icon;
          return (
            <li key={v.title} className="card p-5">
              <Icon aria-hidden className="h-6 w-6 text-primary-600" />
              <h2 className="mt-3 font-semibold text-ink">{v.title}</h2>
              <p className="mt-1 text-sm text-neutral-500">{v.desc}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button to="/motors">Lihat motor</Button>
        <Button to="/contact" variant="secondary">
          Hubungi kami
        </Button>
      </div>
    </PageContainer>
  );
}
