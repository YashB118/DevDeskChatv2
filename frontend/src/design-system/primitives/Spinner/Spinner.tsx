import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Loader2 } from '@/design-system/icons';
import { cn } from '@/shared/utils';

const spinnerVariants = cva('inline-block animate-spin text-[var(--color-fg-muted)]', {
  variants: {
    size: {
      sm: 'h-3 w-3',
      md: 'h-5 w-5',
      lg: 'h-8 w-8',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface SpinnerProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { className, size, label = 'Loading', ...props },
  ref,
) {
  return (
    <span ref={ref} role="status" aria-live="polite" className={cn(className)} {...props}>
      <Loader2 className={cn(spinnerVariants({ size }))} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
});
