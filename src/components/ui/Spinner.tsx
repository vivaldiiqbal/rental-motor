import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Spinner({ className, label = 'Memuat' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 aria-hidden className={cn('h-5 w-5 animate-spin', className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
