import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm',
  secondary:
    'bg-white text-primary-700 border border-neutral-300 hover:bg-neutral-100 active:bg-neutral-200',
  ghost: 'bg-transparent text-primary-700 hover:bg-neutral-100 active:bg-neutral-200',
  danger: 'bg-danger-600 text-white hover:opacity-90 active:opacity-100 shadow-sm',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-[36px] px-3 text-sm',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[48px] px-6 text-base',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  /** Jika diisi, dirender sebagai tautan internal */
  to?: string;
  leftIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    fullWidth,
    to,
    leftIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className,
  );

  if (to && !disabled) {
    return (
      <Link
        to={to}
        className={classes}
        onClick={rest.onClick as unknown as MouseEventHandler<HTMLAnchorElement>}
      >
        {leftIcon}
        {children}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : leftIcon}
      {children}
    </button>
  );
});
