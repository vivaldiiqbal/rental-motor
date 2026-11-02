import { forwardRef, useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

const control =
  'w-full min-h-[44px] rounded-xl border bg-white px-3 text-sm text-ink placeholder:text-neutral-500 ' +
  'transition-colors duration-150 disabled:bg-neutral-100 disabled:text-neutral-500';
const borderFor = (error?: string) =>
  error ? 'border-danger-600' : 'border-neutral-300 hover:border-neutral-500';

function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-neutral-700">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger-600">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-neutral-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  /** Elemen di sisi kanan (mis. tombol tampil/sembunyi sandi) */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, trailing, className, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(control, borderFor(error), trailing && 'pr-11', className)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, className, id: idProp, children, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(control, borderFor(error), 'appearance-none pr-9', className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </Field>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, className, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <textarea
        ref={ref}
        id={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(control, borderFor(error), 'min-h-[96px] py-2.5', className)}
        {...rest}
      />
    </Field>
  );
});

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, className, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div>
      <label htmlFor={id} className="flex min-h-[28px] cursor-pointer items-start gap-2.5 text-sm text-neutral-700">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={!!error}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-primary-600',
            className,
          )}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});
