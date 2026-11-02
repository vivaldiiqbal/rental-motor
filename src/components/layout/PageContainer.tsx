import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function PageContainer({
  children,
  className,
  narrow,
}: {
  children: ReactNode;
  className?: string;
  /** Lebar terbatas untuk halaman teks/formulir */
  narrow?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-8 sm:px-6 lg:px-8', narrow ? 'max-w-3xl' : 'max-w-7xl', className)}>
      {children}
    </div>
  );
}
