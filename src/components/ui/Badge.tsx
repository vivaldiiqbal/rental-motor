import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'success' | 'neutral' | 'warning' | 'danger' | 'primary';

const tones: Record<Tone, string> = {
  success: 'bg-success-50 text-success-800',
  neutral: 'bg-neutral-100 text-neutral-700',
  warning: 'bg-warning text-warning-text',
  danger: 'bg-danger-50 text-danger-700',
  primary: 'bg-primary-600 text-white',
};

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
