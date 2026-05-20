import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-[length:var(--text-xs)] font-medium leading-none',
  {
    variants: {
      tone: {
        neutral:
          'bg-[var(--color-bg-elevated)] text-[var(--color-fg-secondary)] border border-[var(--color-border-subtle)]',
        accent: 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]',
        success: 'bg-[var(--color-success)] text-[var(--color-success-fg)]',
        warning: 'bg-[var(--color-warning)] text-[var(--color-warning-fg)]',
        danger: 'bg-[var(--color-danger)] text-[var(--color-danger-fg)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone, ...props },
  ref,
) {
  return <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />;
});
