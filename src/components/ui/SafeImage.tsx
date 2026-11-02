import { useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { Bike } from 'lucide-react';
import { cn } from '../../lib/cn';

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  alt: string;
  /** Kelas untuk pembungkus (mengatur ukuran/rasio) */
  wrapperClassName?: string;
}

/** Gambar aman: jika gagal dimuat/kosong, tampilkan placeholder abu-abu dengan ikon motor. */
export function SafeImage({ src, alt, className, wrapperClassName, ...rest }: Props) {
  const [prevSrc, setPrevSrc] = useState(src);
  const [failed, setFailed] = useState(!src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(!src);
  }

  return (
    <div className={cn('relative overflow-hidden bg-neutral-100', wrapperClassName)}>
      {failed ? (
        <div
          role="img"
          aria-label={alt}
          className="flex h-full w-full items-center justify-center text-neutral-300"
        >
          <Bike aria-hidden className="h-1/3 w-1/3 max-h-16 max-w-16" strokeWidth={1.5} />
        </div>
      ) : (
        <img
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', className)}
          {...rest}
        />
      )}
    </div>
  );
}
