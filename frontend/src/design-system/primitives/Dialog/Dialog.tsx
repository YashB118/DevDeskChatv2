import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ComponentRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@/design-system/icons';
import { cn } from '@/shared/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-[var(--color-overlay-scrim)]',
        'data-[state=open]:animate-[fadeIn_var(--motion-base)_var(--easing-standard)]',
        className,
      )}
      {...props}
    />
  );
});

export interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideClose?: boolean;
}

export const DialogContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent({ className, children, hideClose, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2',
          'rounded-[var(--radius-lg)] bg-[var(--color-bg-canvas)] text-[var(--color-fg-primary)]',
          'shadow-[var(--shadow-3)] border border-[var(--color-border-subtle)]',
          'p-6 focus:outline-none',
          'data-[state=open]:animate-[slideUp_var(--motion-base)_var(--easing-standard)]',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogClose
            aria-label="Close dialog"
            className={cn(
              'absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)]',
              'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
            )}
          >
            <X className="h-4 w-4" aria-hidden />
          </DialogClose>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-6 flex flex-row-reverse gap-2', className)} {...props} />
  );
}

export const DialogTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-[length:var(--text-lg)] font-semibold leading-tight', className)}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-[length:var(--text-sm)] text-[var(--color-fg-muted)]', className)}
      {...props}
    />
  );
});
