import { useId, useState } from 'react';
import type { ReactNode } from 'react';

/** Tooltip sederhana: muncul saat hover/fokus, terhubung lewat aria-describedby. */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      aria-describedby={show ? id : undefined}
    >
      {children}
      {show && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-ink px-2.5 py-1.5 text-xs text-white shadow-md"
        >
          {text}
        </span>
      )}
    </span>
  );
}
