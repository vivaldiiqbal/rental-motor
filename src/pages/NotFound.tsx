import { Bike } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/ui/Button';

export default function NotFound() {
  return (
    <PageContainer narrow>
      <Seo title="Halaman tidak ditemukan" description="Halaman yang Anda cari tidak ditemukan." />
      <div className="py-12 text-center">
        <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-neutral-100 text-neutral-300">
          <Bike aria-hidden className="h-14 w-14" strokeWidth={1.5} />
        </div>
        <p className="text-5xl font-bold text-primary-700">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Halaman tidak ditemukan</h1>
        <p className="mx-auto mt-2 max-w-md text-neutral-500">
          Sepertinya Anda tersesat. Halaman yang dicari tidak ada atau sudah dipindahkan.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to="/">Kembali ke Beranda</Button>
          <Button to="/motors" variant="secondary">
            Lihat motor
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
