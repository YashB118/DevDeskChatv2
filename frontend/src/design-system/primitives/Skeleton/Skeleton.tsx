import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/utils';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        'animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)]',
        className,
      )}
      {...props}
    />
  );
});
