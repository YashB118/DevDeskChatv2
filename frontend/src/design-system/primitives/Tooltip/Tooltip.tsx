import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ComponentRef, ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/shared/utils';

export function TooltipProvider({
  children,
  delayDuration = 200,
}: {
  children: ReactNode;
  delayDuration?: number;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>{children}</TooltipPrimitive.Provider>
  );
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ComponentRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded-[var(--radius-sm)] bg-[var(--color-fg-primary)] text-[var(--color-bg-canvas)]',
          'px-2.5 py-1.5 text-[length:var(--text-xs)] font-medium shadow-[var(--shadow-2)]',
          'data-[state=delayed-open]:animate-[fadeIn_var(--motion-fast)_var(--easing-standard)]',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
