import { useEffect, useState } from 'react';
import { InfoPage } from '../components/layout/InfoPage';
import { SafeHtml } from '../components/common/SafeHtml';
import { site } from '../config/site';
import { getPage } from '../services/api';
import type { PageContent } from '../types';

const r = site.rental;

export default function Terms() {
  const [page, setPage] = useState<PageContent | null>(null);

  useEffect(() => {
    let active = true;
    getPage('terms')
      .then((data) => {
        if (active && data?.bodyHtml) setPage(data);
      })
      .catch(() => {
        // Fallback ke sections statis jika API gagal
      });
    return () => {
      active = false;
    };
  }, []);

  if (page) {
    return (
      <InfoPage
        title={page.title || 'Syarat dan Ketentuan'}
        description={`Syarat dan ketentuan sewa motor di ${site.name}.`}
        intro={`Versi ${page.version} • Berlaku untuk seluruh transaksi pemesanan motor.`}
      >
        <SafeHtml html={page.bodyHtml} />
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="font-bold text-gray-900 text-sm mb-2">Pelacakan GPS dan Keamanan Armada</h3>
          <p className="text-gray-600 text-xs leading-relaxed">
            Seluruh unit motor RodaKita dilengkapi dengan perangkat pelacak GPS aktif demi keamanan armada dan privasi keselamatan penyewa. Data telemetri dan koordinat lokasi hanya dapat diakses secara terbatas oleh petugas operasional dan staf berwenang untuk keperluan tanggap darurat, kepatuhan wilayah operasional, dan pencegahan pencurian. Pelanggan tidak diberikan akses terhadap antarmuka data lokasi.
          </p>
        </div>
      </InfoPage>
    );
  }

  return (
    <InfoPage
      title="Syarat dan Ketentuan"
      description={`Syarat dan ketentuan sewa motor di ${site.name}.`}
      intro="Harap baca ketentuan berikut sebelum menyewa motor."
      sections={[
        {
          title: 'Persyaratan penyewa',
          body: (
            <ul className="list-disc space-y-1 pl-5">
              {r.requirements.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ),
        },
        {
          title: 'Durasi dan pembayaran',
          body: (
            <p>
              Durasi sewa minimal {r.minDays} hari dan maksimal {r.maxDays} hari per pemesanan. Pembayaran dilakukan sesuai metode
              yang dipilih saat pemesanan.
            </p>
          ),
        },
        {
          title: 'Deposit',
          body: <p>Deposit dibayarkan saat pengambilan motor dan dikembalikan penuh setelah motor dikembalikan dalam kondisi baik.</p>,
        },
        {
          title: 'Keterlambatan',
          body: (
            <p>
              Keterlambatan pengembalian dikenakan denda {r.lateFeePercentPerHour}% dari harga sewa harian untuk setiap jam
              keterlambatan.
            </p>
          ),
        },
        {
          title: 'Pembatalan',
          body: <p>Pembatalan gratis dapat dilakukan paling lambat {r.freeCancelHours} jam sebelum sewa dimulai. Setelah itu, kebijakan biaya pembatalan berlaku.</p>,
        },
        {
          title: 'Kerusakan dan kehilangan',
          body: <p>Penyewa bertanggung jawab atas kerusakan, kehilangan, dan pelanggaran lalu lintas selama masa sewa.</p>,
        },
        {
          title: 'Pelacakan GPS dan Keamanan Armada',
          body: (
            <p>
              Seluruh unit motor RodaKita dilengkapi dengan perangkat pelacak GPS aktif demi keamanan armada dan keselamatan penyewa. Data telemetri dan koordinat lokasi hanya dapat diakses secara terbatas oleh petugas operasional dan staf berwenang untuk keperluan tanggap darurat, kepatuhan wilayah operasional, dan pencegahan pencurian. Pelanggan tidak diberikan akses terhadap antarmuka data lokasi.
            </p>
          ),
        },
      ]}
    />
  );
}
