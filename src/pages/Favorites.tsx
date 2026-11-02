import { Heart } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { MotorCard } from '../components/motor/MotorCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { MotorGridSkeleton } from '../components/ui/Skeleton';
import { useAsync } from '../hooks/useAsync';
import { useFavorites } from '../context/FavoritesContext';
import { getMotorsByIds } from '../services/api';

export default function Favorites() {
  const { ids } = useFavorites();
  const { data, loading, error, reload } = useAsync(() => getMotorsByIds(ids), [ids.join(',')]);
  // Hanya tampilkan yang masih ada di favorit (hapus langsung tercermin tanpa menunggu fetch)
  const motors = (data ?? []).filter((m) => ids.includes(m.id));

  return (
    <PageContainer>
      <Seo title="Favorit" description="Daftar motor favorit Anda." />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Favorit' }]} />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Motor favorit</h1>
      <p className="mt-1 text-sm text-neutral-500">Tersimpan di perangkat ini dan digabung ke akun saat Anda masuk.</p>

      <div className="mt-6">
        {ids.length === 0 ? (
          <EmptyState
            icon={<Heart aria-hidden className="h-6 w-6" />}
            title="Belum ada motor favorit"
            description="Tekan ikon hati pada motor yang Anda suka agar mudah ditemukan lagi."
            action={<Button to="/motors">Jelajahi motor</Button>}
          />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : loading && !data ? (
          <MotorGridSkeleton count={Math.min(ids.length, 3)} />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {motors.map((m) => (
              <MotorCard key={m.id} motor={m} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
