import { useEffect, useState } from 'react';
import { InfoPage } from '../components/layout/InfoPage';
import { SafeHtml } from '../components/common/SafeHtml';
import { site } from '../config/site';
import { getPage } from '../services/api';
import type { PageContent } from '../types';

export default function Privacy() {
  const [page, setPage] = useState<PageContent | null>(null);

  useEffect(() => {
    let active = true;
    getPage('privacy')
      .then((data) => {
        if (active && data?.bodyHtml) setPage(data);
      })
      .catch(() => {
        // Fallback ke sections statis
      });
    return () => {
      active = false;
    };
  }, []);

  if (page) {
    return (
      <InfoPage
        title={page.title || 'Kebijakan Privasi'}
        description={`Cara ${site.name} mengumpulkan dan melindungi data pribadi Anda.`}
        intro={`Versi ${page.version} • Kebijakan perlindungan data pelanggan.`}
      >
        <SafeHtml html={page.bodyHtml} />
      </InfoPage>
    );
  }

  return (
    <InfoPage
      title="Kebijakan Privasi"
      description={`Cara ${site.name} mengumpulkan dan melindungi data pribadi Anda.`}
      intro="Kami menghargai privasi Anda dan hanya memakai data seperlunya untuk layanan sewa."
      sections={[
        {
          title: 'Data yang kami kumpulkan',
          body: <p>Nama, kontak, nomor identitas, dokumen KTP/SIM, serta riwayat pemesanan yang Anda berikan saat memakai layanan.</p>,
        },
        {
          title: 'Penggunaan data',
          body: <p>Data dipakai untuk memproses pemesanan, verifikasi identitas, komunikasi terkait booking, dan peningkatan layanan.</p>,
        },
        {
          title: 'Penyimpanan dan keamanan',
          body: <p>Kami menjaga data dengan langkah keamanan yang wajar. Data tidak dijual kepada pihak ketiga.</p>,
        },
        {
          title: 'Hak Anda',
          body: (
            <p>
              Anda dapat meminta akses, perbaikan, atau penghapusan data dengan menghubungi kami di{' '}
              <a href={`mailto:${site.email}`} className="font-medium text-primary-600 underline">
                {site.email}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
