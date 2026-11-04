import { memo } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Ban, CheckCircle2, Heart, Scale } from 'lucide-react';
import type { Motor } from '../../types';
import { SafeImage } from '../ui/SafeImage';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { RatingStars } from '../ui/RatingStars';
import { SpecInline } from './SpecGrid';
import { useFavorites } from '../../context/FavoritesContext';
import { MAX_COMPARE, useCompare } from '../../context/CompareContext';
import { countDays, formatRupiah } from '../../lib/format';
import { dateQuery } from '../../lib/links';
import { cn } from '../../lib/cn';

interface Props {
  motor: Motor;
  startDate?: string;
  endDate?: string;
  /** Sembunyikan pilihan bandingkan (mis. di halaman favorit) */
  hideCompare?: boolean;
}

function MotorCardBase({ motor, startDate, endDate, hideCompare }: Props) {
  const { isFavorite, toggle } = useFavorites();
  const compare = useCompare();
  const fav = isFavorite(motor.id);
  const comparing = compare.has(motor.id);
  const hasDates = !!startDate && !!endDate;
  const days = hasDates ? countDays(startDate, endDate) : 0;
  const isRented = motor.status === 'rented';
  const available = !isRented && (motor.available ?? motor.status === 'available');
  const detailUrl = `/motors/${motor.slug}${dateQuery(startDate, endDate)}`;

  const onFav = () => {
    const added = toggle(motor.id);
    toast.success(added ? `${motor.name} ditambahkan ke favorit` : `${motor.name} dihapus dari favorit`);
  };
  const onCompare = () => {
    if (!compare.toggle(motor.id)) toast.error(`Maksimal ${MAX_COMPARE} motor untuk dibandingkan.`);
  };

  return (
    <article className="card flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <div className="relative">
        <Link to={detailUrl} aria-label={`Lihat detail ${motor.name}`} tabIndex={-1}>
          <SafeImage src={motor.images[0]} alt={`Foto ${motor.name}`} wrapperClassName="aspect-[4/3] w-full" />
        </Link>
        <div className="absolute left-3 top-3">
          {available ? (
            <Badge tone="success" icon={<CheckCircle2 aria-hidden className="h-3.5 w-3.5" />}>
              Tersedia
            </Badge>
          ) : isRented ? (
            <Badge tone="warning" icon={<Ban aria-hidden className="h-3.5 w-3.5" />}>
              Sedang Disewa / Tidak Tersedia
            </Badge>
          ) : (
            <Badge tone="neutral" icon={<Ban aria-hidden className="h-3.5 w-3.5" />}>
              {hasDates ? 'Tidak tersedia di tanggal ini' : 'Tidak tersedia'}
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={onFav}
          aria-pressed={fav}
          aria-label={fav ? `Hapus ${motor.name} dari favorit` : `Tambah ${motor.name} ke favorit`}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-150 hover:scale-105"
        >
          <Heart aria-hidden className={cn('h-5 w-5', fav ? 'fill-danger-600 text-danger-600' : 'text-neutral-700')} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">
            <Link to={detailUrl} className="hover:text-primary-600">
              {motor.name}
            </Link>
          </h3>
          <p className="text-sm text-neutral-500">{motor.brand}</p>
        </div>
        <SpecInline motor={motor} />
        <RatingStars value={motor.rating} count={motor.reviewCount} showValue size={14} />

        <div className="mt-auto pt-1">
          <p className="text-xl font-bold text-ink">
            {formatRupiah(motor.pricePerDay)}
            <span className="text-sm font-normal text-neutral-500"> / hari</span>
          </p>
          {hasDates && (
            <p className="text-sm text-neutral-500">
              Estimasi {days} hari:{' '}
              <span className="font-semibold text-primary-700">{formatRupiah(motor.pricePerDay * days)}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button to={detailUrl} fullWidth>
            Lihat Detail
          </Button>
        </div>
        {!hideCompare && (
          <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={comparing}
              onChange={onCompare}
              className="h-4 w-4 accent-primary-600"
              aria-label={`Bandingkan ${motor.name}`}
            />
            <Scale aria-hidden className="h-4 w-4 text-neutral-500" />
            Bandingkan
          </label>
        )}
      </div>
    </article>
  );
}

export const MotorCard = memo(MotorCardBase);
