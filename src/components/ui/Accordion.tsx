import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface AccordionItem {
  title: string;
  content: ReactNode;
}

export function Accordion({ items }: { items: AccordionItem[] }) {
  const base = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.title}>
            <h3>
              <button
                type="button"
                id={`${base}-h-${i}`}
                aria-expanded={open}
                aria-controls={`${base}-p-${i}`}
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex min-h-[52px] w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-neutral-50"
              >
                {item.title}
                <ChevronDown
                  aria-hidden
                  className={cn('h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200', open && 'rotate-180')}
                />
              </button>
            </h3>
            <div
              id={`${base}-p-${i}`}
              role="region"
              aria-labelledby={`${base}-h-${i}`}
              hidden={!open}
              className="px-4 pb-4 text-sm leading-relaxed text-neutral-700"
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
