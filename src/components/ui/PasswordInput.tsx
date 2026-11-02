import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './Input';
import { passwordStrength } from '../../lib/validators';
import { cn } from '../../lib/cn';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
  hint?: string;
  showStrength?: boolean;
}

const barColor = ['bg-neutral-200', 'bg-danger-600', 'bg-warning-text', 'bg-success-600', 'bg-success-600'];

/** Input sandi dengan tombol tampil/sembunyi dan indikator kekuatan opsional. */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { showStrength, value, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(String(value ?? ''));
  return (
    <div>
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        value={value}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            aria-pressed={visible}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-500 hover:text-ink"
          >
            {visible ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          </button>
        }
        {...rest}
      />
      {showStrength && strength.score > 0 && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={cn('h-1.5 flex-1 rounded-full', n <= strength.score ? barColor[strength.score] : 'bg-neutral-200')}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Kekuatan: <span className="font-medium text-ink">{strength.label}</span>
            {strength.tips.length > 0 && ` · Tambahkan: ${strength.tips.join(', ').toLowerCase()}`}
          </p>
        </div>
      )}
    </div>
  );
});
