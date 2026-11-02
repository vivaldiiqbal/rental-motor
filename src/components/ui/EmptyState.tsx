import type { ReactNode } from 'react';
import { AlertTriangle, SearchX } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        {icon ?? <SearchX aria-hidden className="h-6 w-6" />}
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message = 'Terjadi kesalahan saat memuat data.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle aria-hidden className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-ink">Terjadi kesalahan</h3>
      <p className="mt-1 max-w-md text-sm text-neutral-500">{message}</p>
      {onRetry && (
        <Button className="mt-6" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}
