import type { ReactNode } from 'react';
import { cn } from '@/shared/utils';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <header className={cn('flex items-start justify-between gap-4 pb-3', className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
          {title}
        </h2>
        {description && (
          <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
