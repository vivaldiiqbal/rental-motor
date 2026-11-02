import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SafeImage } from '../ui/SafeImage';
import { cn } from '../../lib/cn';

export function MotorGallery({ images, name }: { images: string[]; name: string }) {
  const list = images.length > 0 ? images : [''];
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, list.length - 1);
  const go = (d: number) => setIndex((safeIndex + d + list.length) % list.length);

  return (
    <div>
      <div className="relative">
        <SafeImage
          src={list[safeIndex]}
          alt={`Foto ${name} ${safeIndex + 1} dari ${list.length}`}
          wrapperClassName="aspect-[4/3] w-full rounded-xl"
          loading="eager"
        />
        {list.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Foto sebelumnya"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-sm hover:bg-neutral-100"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Foto berikutnya"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-sm hover:bg-neutral-100"
            >
              <ChevronRight aria-hidden className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      {list.length > 1 && (
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {list.map((src, i) => (
            <li key={`${src}-${i}`}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Lihat foto ${i + 1}`}
                aria-current={i === safeIndex}
                className={cn(
                  'block w-full overflow-hidden rounded-xl border-2 transition-colors duration-150',
                  i === safeIndex ? 'border-primary-600' : 'border-transparent hover:border-neutral-300',
                )}
              >
                <SafeImage src={src} alt={`Miniatur ${name} ${i + 1}`} wrapperClassName="aspect-[4/3] w-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
