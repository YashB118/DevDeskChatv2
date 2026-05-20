import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { X } from '@/design-system/icons';
import { cn } from '@/shared/utils';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
  icon?: ReactNode;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { className, children, onRemove, icon, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]',
        'bg-[var(--color-bg-elevated)] px-2 py-0.5',
        'text-[length:var(--text-xs)] text-[var(--color-fg-secondary)]',
        className,
      )}
      {...props}
    >
      {icon && <span aria-hidden className="inline-flex">{icon}</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove tag"
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-full)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
});
