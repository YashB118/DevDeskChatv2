import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils';

export const inputVariants = cva(
  [
    'block w-full rounded-[var(--radius-md)]',
    'bg-[var(--color-bg-canvas)] text-[var(--color-fg-primary)]',
    'border border-[var(--color-border-default)]',
    'placeholder:text-[var(--color-fg-muted)]',
    'transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:border-[var(--color-accent)]',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'aria-[invalid=true]:border-[var(--color-danger)]',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'h-8 px-2 text-[length:var(--text-sm)]',
        md: 'h-10 px-3 text-[length:var(--text-sm)]',
        lg: 'h-12 px-4 text-[length:var(--text-md)]',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  VariantProps<typeof inputVariants>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  );
});
