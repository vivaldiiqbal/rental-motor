import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Ban, CheckCircle2, Heart, Scale, Share2 } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { MotorGallery } from '../components/motor/MotorGallery';
import { SpecGrid } from '../components/motor/SpecGrid';
import { BookingCard } from '../components/motor/BookingCard';
import { ReviewList } from '../components/motor/ReviewList';
import { ReviewForm } from '../components/motor/ReviewForm';
import { MotorCard } from '../components/motor/MotorCard';
import type { DateValue } from '../components/motor/DateRangePicker';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { RatingStars } from '../components/ui/RatingStars';
import { Tabs } from '../components/ui/Tabs';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { useAsync } from '../hooks/useAsync';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { useRealtime } from '../context/RealtimeContext';
import { useFavorites } from '../context/FavoritesContext';
import { MAX_COMPARE, useCompare } from '../context/CompareContext';
import { ApiError, checkAvailability, getBlockedRanges, getMotorBySlug, getReviews, getSimilarMotors } from '../services/api';
import { formatRupiah } from '../lib/format';
import { dateQuery } from '../lib/links';
import { cn } from '../lib/cn';

function DetailSkeleton() {
  return (
    <PageContainer>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]" role="status" aria-label="Memuat detail motor">
        <div className="space-y-4">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </PageContainer>
  );
}

export default function MotorDetail() {
  const { slug = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const dates: DateValue = { startDate: sp.get('start') ?? undefined, endDate: sp.get('end') ?? undefined };
  const [tab, setTab] = useState('deskripsi');
  const { isFavorite, toggle } = useFavorites();
  const compare = useCompare();

  const motorQ = useAsync(() => getMotorBySlug(slug), [slug]);
  const motor = motorQ.data;
  const motorId = motor?.id;

  const blockedQ = useAsync(() => (motorId ? getBlockedRanges(motorId) : Promise.resolve([])), [motorId]);
  const availQ = useAsync(
    () =>
      motorId && dates.startDate && dates.endDate
        ? checkAvailability(motorId, dates.startDate, dates.endDate)
        : Promise.resolve(null),
    [motorId, dates.startDate, dates.endDate],
  );
  const reviewsQ = useAsync(() => (motorId ? getReviews(motorId) : Promise.resolve([])), [motorId]);
  const similarQ = useAsync(() => (motor ? getSimilarMotors(motor) : Promise.resolve([])), [motorId]);

  const { registerRefetch } = useRealtime();

  useEffect(() => {
    if (!motorId) return;
    return registerRefetch(`motor-detail-${motorId}`, () => {
      blockedQ.reload();
      availQ.reload();
    });
  }, [registerRefetch, motorId, blockedQ.reload, availQ.reload]);

  useRealtimeSubscription(['motor.availability.changed', 'booking.updated'], (event) => {
    if (event.type === 'motor.availability.changed' && event.entityId && motorId && event.entityId !== motorId) {
      return;
    }
    blockedQ.reload();
    availQ.reload();
  });

  if (motorQ.loading && !motor) return <DetailSkeleton />;

  if (motorQ.error || !motor) {
    const notFound = motorQ.error instanceof ApiError && motorQ.error.code === 'NOT_FOUND';
    return (
      <PageContainer narrow>
        <Seo title="Motor tidak ditemukan" />
        {notFound ? (
          <EmptyState
            title="Motor tidak ditemukan"
            description="Motor yang Anda cari mungkin sudah tidak tersedia."
            action={<Button to="/motors">Lihat semua motor</Button>}
          />
        ) : (
          <ErrorState onRetry={motorQ.reload} />
        )}
      </PageContainer>
    );
  }

  const fav = isFavorite(motor.id);
  const comparing = compare.has(motor.id);
  const available = motor.status === 'available';
  const checking = !!dates.startDate && !!dates.endDate && availQ.loading;

  const setDates = (v: DateValue) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v.startDate && v.endDate) {
          next.set('start', v.startDate);
          next.set('end', v.endDate);
        } else {
          next.delete('start');
          next.delete('end');
        }
        return next;
      },
      { replace: true },
    );

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: motor.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Tautan disalin');
      }
    } catch {
      /* pengguna membatalkan berbagi */
    }
  };

  const reviews = reviewsQ.data ?? [];

  return (
    <PageContainer>
      <Seo title={motor.name} description={`${motor.name} ${motor.cc}cc, ${motor.transmission}. Sewa mulai ${formatRupiah(motor.pricePerDay)} per hari.`} />
      <Breadcrumb items={[{ label: 'Beranda', to: '/' }, { label: 'Pilih Motor', to: `/motors${dateQuery(dates.startDate, dates.endDate)}` }, { label: motor.name }]} />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <MotorGallery images={motor.images} name={motor.name} />

          <header>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink sm:text-3xl">{motor.name}</h1>
                <p className="mt-1 text-neutral-500">
                  {motor.brand} · {motor.year}
                </p>
              </div>
              {available ? (
                <Badge tone="success" icon={<CheckCircle2 aria-hidden className="h-3.5 w-3.5" />}>
                  Tersedia
                </Badge>
              ) : (
                <Badge tone="warning" icon={<Ban aria-hidden className="h-3.5 w-3.5" />}>
                  Sedang perawatan
                </Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <RatingStars value={motor.rating} count={motor.reviewCount} showValue />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={fav}
                onClick={() => toast.success(toggle(motor.id) ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit')}
                leftIcon={<Heart aria-hidden className={cn('h-4 w-4', fav && 'fill-danger-600 text-danger-600')} />}
              >
                {fav ? 'Favorit' : 'Simpan ke favorit'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={comparing}
                onClick={() => {
                  if (!compare.toggle(motor.id)) toast.error(`Maksimal ${MAX_COMPARE} motor untuk dibandingkan.`);
                }}
                leftIcon={<Scale aria-hidden className="h-4 w-4" />}
              >
                {comparing ? 'Dalam perbandingan' : 'Bandingkan'}
              </Button>
              <Button variant="ghost" size="sm" onClick={share} leftIcon={<Share2 aria-hidden className="h-4 w-4" />}>
                Bagikan
              </Button>
            </div>
          </header>

          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              {
                id: 'deskripsi',
                label: 'Deskripsi',
                content: (
                  <div className="space-y-4">
                    <p className="leading-relaxed text-neutral-700">{motor.description}</p>
                    <h2 className="font-semibold text-ink">Fitur</h2>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {motor.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-neutral-700">
                          <CheckCircle2 aria-hidden className="h-4 w-4 text-success-600" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              },
              { id: 'spesifikasi', label: 'Spesifikasi', content: <SpecGrid motor={motor} /> },
              {
                id: 'ulasan',
                label: `Ulasan (${reviews.length || motor.reviewCount})`,
                content: (
                  <div className="space-y-8">
                    {reviewsQ.error ? <ErrorState onRetry={reviewsQ.reload} /> : <ReviewList reviews={reviews} />}
                    <div className="card p-5">
                      <h2 className="mb-3 font-semibold text-ink">Tulis ulasan</h2>
                      <ReviewForm
                        motorId={motor.id}
                        onAdded={() => {
                          reviewsQ.reload();
                          motorQ.reload();
                        }}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <BookingCard
            motor={motor}
            dates={dates}
            onDatesChange={setDates}
            blocked={blockedQ.data ?? []}
            available={checking ? null : availQ.data}
          />
        </div>
      </div>

      {(similarQ.data?.length ?? 0) > 0 && (
        <section className="mt-16" aria-labelledby="serupa">
          <h2 id="serupa" className="mb-6 text-2xl font-bold text-ink">
            Motor serupa
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similarQ.data?.map((m) => (
              <MotorCard key={m.id} motor={m} startDate={dates.startDate} endDate={dates.endDate} hideCompare />
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
