import type { ReactNode } from 'react';
import { cn } from '@/shared/utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="text-[var(--color-fg-muted)] [&_svg]:h-10 [&_svg]:w-10" aria-hidden>
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
          {title}
        </h3>
        {description && (
          <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)] max-w-sm mx-auto">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
