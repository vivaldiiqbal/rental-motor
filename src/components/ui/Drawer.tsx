import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useId } from 'react';
import { useOverlay } from '../../hooks/useOverlay';
import { cn } from '../../lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right' | 'bottom';
}

const sides = {
  left: 'inset-y-0 left-0 w-[85%] max-w-sm',
  right: 'inset-y-0 right-0 w-[85%] max-w-sm',
  bottom: 'inset-x-0 bottom-0 max-h-[90vh] rounded-t-xl',
};

export function Drawer({ open, onClose, title, children, footer, side = 'right' }: Props) {
  const ref = useOverlay(open, onClose);
  const titleId = useId();
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('absolute flex flex-col bg-white shadow-md', sides[side])}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-neutral-200 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
