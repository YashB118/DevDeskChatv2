import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'block w-full rounded-[var(--radius-md)]',
        'bg-[var(--color-bg-canvas)] text-[var(--color-fg-primary)]',
        'border border-[var(--color-border-default)]',
        'placeholder:text-[var(--color-fg-muted)]',
        'px-3 py-2 text-[length:var(--text-sm)] leading-[var(--leading-normal)]',
        'transition-colors resize-y',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:border-[var(--color-accent)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'aria-[invalid=true]:border-[var(--color-danger)]',
        className,
      )}
      {...props}
    />
  );
});
