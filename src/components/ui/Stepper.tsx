import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-center" aria-label="Langkah pemesanan">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}
          >
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  done && 'bg-success-600 text-white',
                  active && 'bg-primary-600 text-white',
                  !done && !active && 'bg-neutral-200 text-neutral-700',
                )}
              >
                {done ? <Check aria-hidden className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-xs font-medium sm:text-sm',
                  active ? 'text-ink' : 'text-neutral-500',
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                aria-hidden
                className={cn('mx-2 h-0.5 flex-1 sm:mx-4', done ? 'bg-success-600' : 'bg-neutral-200')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
