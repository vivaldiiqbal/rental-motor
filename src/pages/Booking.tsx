import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PageContainer } from '../components/layout/PageContainer';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BookingStepper } from '../components/booking/BookingStepper';
import { StepRentalDetail } from '../components/booking/StepRentalDetail';
import { StepRenterData } from '../components/booking/StepRenterData';
import { StepPayment } from '../components/booking/StepPayment';
import {
  BOOKING_STEPS,
  emptyDraft,
  validatePayment,
  validateRental,
  validateRenter,
} from '../components/booking/draft';
import type { BookingDraft, DraftErrors } from '../components/booking/draft';
import type { BookingQuote } from '../types';
import { PriceSummary } from '../components/motor/PriceSummary';
import { Button } from '../components/ui/Button';
import { SafeImage } from '../components/ui/SafeImage';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { ApiError, createBooking, getBlockedRanges, getMotorBySlug, getPage, getBookingQuote } from '../services/api';
import { countDays } from '../lib/format';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';

export default function Booking() {
  const { slug = '' } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSiteSettings();

  const draftKey = `rk_booking_draft_${slug}`;
  const initialSaved = readStorage<{ step?: number; draft?: Partial<BookingDraft> } | null>(draftKey, null);

  const [step, setStep] = useState(() => (typeof initialSaved?.step === 'number' ? Math.min(2, Math.max(0, initialSaved.step)) : 0));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [serverError, setServerError] = useState('');
  const [suggestion, setSuggestion] = useState<{ start: string; end: string } | null>(null);
  const [termsVersion, setTermsVersion] = useState<number | null>(null);
  const [draft, setDraft] = useState<BookingDraft>(() => {
    const base = emptyDraft(user, sp.get('start') ?? undefined, sp.get('end') ?? undefined);
    return initialSaved?.draft ? { ...base, ...initialSaved.draft } : base;
  });

  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    getPage('terms')
      .then((data) => {
        if (data?.version) setTermsVersion(data.version);
      })
      .catch(() => {});
  }, []);

  // Simpan draft dan step ke localStorage agar saat refresh data tetap ada
  useEffect(() => {
    if (slug) {
      writeStorage(draftKey, { step, draft });
    }
  }, [draftKey, slug, step, draft]);

  const motorQ = useAsync(() => getMotorBySlug(slug), [slug]);
  const motor = motorQ.data;
  const blockedQ = useAsync(() => (motor ? getBlockedRanges(motor.id) : Promise.resolve([])), [motor?.id]);

  // Kalkulasi harga dinamis real-time (aturan weekend/seasonal, diskon durasi sewa, promo, ongkir)
  useEffect(() => {
    if (!motor || !draft.startDate || !draft.endDate) {
      setQuote(null);
      return;
    }
    const days = countDays(draft.startDate, draft.endDate);
    if (days <= 0) {
      setQuote(null);
      return;
    }

    let active = true;
    setQuoteLoading(true);

    getBookingQuote({
      motorId: motor.id,
      start: draft.startDate,
      end: draft.endDate,
      delivery: {
        pickup: draft.pickup === 'delivery',
        dropoff: draft.pickup === 'delivery',
      },
      promoCode: draft.promoCode ? draft.promoCode.trim() : undefined,
    })
      .then((data) => {
        if (active) setQuote(data);
      })
      .catch(() => {
        if (active) setQuote(null);
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [motor?.id, draft.startDate, draft.endDate, draft.pickup, draft.promoCode]);

  const patch = (p: Partial<BookingDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    // Hapus pesan error kolom yang sedang diubah
    setErrors((e) => {
      const next = { ...e };
      (Object.keys(p) as Array<keyof BookingDraft>).forEach((k) => delete next[k]);
      return next;
    });
    setServerError('');
  };

  if (motorQ.loading && !motor) {
    return (
      <PageContainer>
        <Skeleton className="h-96 w-full" />
      </PageContainer>
    );
  }
  if (motorQ.error || !motor) {
    const notFound = motorQ.error instanceof ApiError && motorQ.error.code === 'NOT_FOUND';
    return (
      <PageContainer narrow>
        {notFound ? (
          <EmptyState title="Motor tidak ditemukan" action={<Button to="/motors">Pilih motor lain</Button>} />
        ) : (
          <ErrorState onRetry={motorQ.reload} />
        )}
      </PageContainer>
    );
  }
  if (motor.status !== 'available') {
    return (
      <PageContainer narrow>
        <EmptyState
          title="Motor sedang tidak dapat disewa"
          description="Motor ini sedang dalam perawatan. Silakan pilih motor lain."
          action={<Button to="/motors">Pilih motor lain</Button>}
        />
      </PageContainer>
    );
  }

  const days = draft.startDate && draft.endDate ? countDays(draft.startDate, draft.endDate) : 0;

  const next = async () => {
    // Kunci submittingRef mencegah klik ganda secara cepat membuat 2 booking
    if (submittingRef.current) return;

    let result = {};
    if (step === 0) {
      result = validateRental(draft, settings.rental);
    } else if (step === 1) {
      result = validateRenter(draft);
    } else {
      result = validatePayment(draft);
    }
    setErrors(result);
    if (Object.keys(result).length > 0) {
      toast.error('Periksa kembali isian Anda.');
      return;
    }
    if (step < BOOKING_STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!user || !draft.startDate || !draft.endDate) return;

    submittingRef.current = true;
    setSubmitting(true);
    setServerError('');
    setSuggestion(null);
    try {
      const booking = await createBooking({
        motorId: motor.id,
        userId: user.id,
        startDate: draft.startDate,
        endDate: draft.endDate,
        pickup: draft.pickup,
        payment: draft.payment,
        promoCode: draft.promoCode ? draft.promoCode.trim() : undefined,
        renter: {
          name: draft.name.trim(),
          phone: draft.phone.trim(),
          email: draft.email.trim(),
          idNumber: draft.idNumber,
          notes: draft.notes.trim() || undefined,
        },
        acceptedTermsVersion: termsVersion,
      });
      removeStorage(draftKey);
      toast.success('Pesanan berhasil dibuat!');
      navigate(`/bookings/${booking.code}`, { replace: true, state: { created: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Gagal membuat pesanan. Coba lagi.';
      setServerError(message);
      if (e instanceof ApiError && (e.code === 'CONFLICT' || e.code === 'BOOKING_CONFLICT' || e.code.startsWith('INVALID'))) {
        const next = (e.details as { nextAvailable?: { start?: string; end?: string } | null } | null | undefined)?.nextAvailable;
        if (next?.start && next?.end) setSuggestion({ start: next.start, end: next.end });
        setStep(0);
        blockedQ.reload();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <PageContainer>
      <Seo title={`Pesan ${motor.name}`} description={`Pesan sewa ${motor.name} dalam 3 langkah mudah.`} />
      <Breadcrumb
        items={[
          { label: 'Beranda', to: '/' },
          { label: motor.name, to: `/motors/${motor.slug}` },
          { label: 'Pemesanan' },
        ]}
      />
      <h1 className="mb-5 text-2xl font-bold text-ink sm:text-3xl">Pemesanan</h1>
      <BookingStepper current={step} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="card p-5 sm:p-6">
          {serverError && (
            <div role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">
              <p>{serverError}</p>
              {suggestion && (
                <p className="mt-2 text-ink" data-testid="date-suggestion">
                  Tanggal terdekat yang tersedia: <strong>{suggestion.start}</strong> s/d <strong>{suggestion.end}</strong>.{' '}
                  <button
                    type="button"
                    className="font-medium text-primary-600 underline"
                    onClick={() => {
                      patch({ startDate: suggestion.start, endDate: suggestion.end });
                      setServerError('');
                      setSuggestion(null);
                    }}
                  >
                    Pakai tanggal ini
                  </button>
                </p>
              )}
            </div>
          )}
          {step === 0 && (
            <StepRentalDetail
              motor={motor}
              draft={draft}
              errors={errors}
              blocked={blockedQ.data ?? []}
              quote={quote}
              quoteLoading={quoteLoading}
              onChange={patch}
            />
          )}
          {step === 1 && <StepRenterData draft={draft} errors={errors} onChange={patch} />}
          {step === 2 && (
            <StepPayment
              motor={motor}
              draft={draft}
              errors={errors}
              quote={quote}
              quoteLoading={quoteLoading}
              onChange={patch}
            />
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-neutral-200 pt-5">
            {step > 0 ? (
              <Button variant="secondary" onClick={back} disabled={submitting} leftIcon={<ArrowLeft aria-hidden className="h-4 w-4" />}>
                Kembali
              </Button>
            ) : (
              <Button variant="ghost" to={`/motors/${motor.slug}`}>
                Batal
              </Button>
            )}
            <Button onClick={next} loading={submitting} disabled={submitting}>
              {step === BOOKING_STEPS.length - 1 ? 'Bayar Sekarang' : 'Lanjut'}
              {step < BOOKING_STEPS.length - 1 && <ArrowRight aria-hidden className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Ringkasan pesanan">
          <div className="card space-y-4 p-5">
            <SafeImage src={motor.images[0]} alt={`Foto ${motor.name}`} wrapperClassName="aspect-[4/3] w-full rounded-xl" />
            <div>
              <h2 className="font-semibold text-ink">{motor.name}</h2>
              <p className="text-sm text-neutral-500">
                {motor.brand} · {motor.cc} cc · {motor.transmission}
              </p>
            </div>
            {days > 0 ? (
              <PriceSummary
                pricePerDay={motor.pricePerDay}
                days={days}
                deposit={motor.deposit}
                quote={quote}
                loading={quoteLoading}
              />
            ) : (
              <p className="text-sm text-neutral-500">Pilih tanggal untuk melihat rincian harga.</p>
            )}

            {/* Pemberitahuan Pelacakan GPS Armada (Transparansi Privasi) */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
              <div className="flex items-center gap-1.5 font-bold text-neutral-800 mb-1">
                <span>🛡️</span>
                <span>Armada Dilengkapi Pelacak GPS</span>
              </div>
              <p className="text-[11px] leading-relaxed text-neutral-500">
                Demi keamanan bersama, seluruh unit motor RodaKita dipasangi sensor GPS. Data lokasi hanya dapat dipantau oleh petugas operasional untuk keperluan darurat dan pemeliharaan armada.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
