import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

/** Tabs aksesibel: panah kiri/kanan, Home, End berpindah tab. */
export function Tabs({ tabs, value, onChange }: Props) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = tabs.find((t) => t.id === value) ?? tabs[0];

  const onKey = (e: KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-neutral-200">
        {tabs.map((t, i) => {
          const selected = t.id === active.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'min-h-[44px] shrink-0 border-b-2 px-4 text-sm font-medium transition-colors duration-150',
                selected
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-ink',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${active.id}`}
        aria-labelledby={`${base}-tab-${active.id}`}
        tabIndex={0}
        className="pt-6"
      >
        {active.content}
      </div>
    </div>
  );
}
