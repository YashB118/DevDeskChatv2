import { createContext, forwardRef, useCallback, useContext, useMemo, useState } from 'react';
import type { ComponentPropsWithoutRef, ComponentRef, ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from '@/design-system/icons';
import { cn } from '@/shared/utils';

type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

interface ToastItem {
  id: string;
  title: string | undefined;
  description: string | undefined;
  tone: ToastTone;
  durationMs: number;
}

interface ToastContextValue {
  push: (item: Omit<ToastItem, 'id' | 'tone' | 'durationMs'> & { tone?: ToastTone; durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  neutral: 'border-[var(--color-border-default)] bg-[var(--color-bg-overlay)] text-[var(--color-fg-primary)]',
  success: 'border-[var(--color-success)] bg-[var(--color-bg-overlay)] text-[var(--color-fg-primary)]',
  warning: 'border-[var(--color-warning)] bg-[var(--color-bg-overlay)] text-[var(--color-fg-primary)]',
  danger: 'border-[var(--color-danger)] bg-[var(--color-bg-overlay)] text-[var(--color-fg-primary)]',
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${String(Date.now())}-${String(counter)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string): void => {
    setItems((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['push']>((item) => {
    const id = nextId();
    setItems((curr) => [
      ...curr,
      { id, tone: item.tone ?? 'neutral', durationMs: item.durationMs ?? 4500, title: item.title, description: item.description },
    ]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            duration={t.durationMs}
            onOpenChange={(open) => { if (!open) dismiss(t.id); }}
            className={cn(
              'group pointer-events-auto relative flex w-[min(92vw,360px)] items-start gap-3 rounded-[var(--radius-md)] border p-3 pr-9 shadow-[var(--shadow-2)]',
              'data-[state=open]:animate-[slideUp_var(--motion-base)_var(--easing-standard)]',
              'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
              'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
              'data-[swipe=end]:animate-[fadeIn_var(--motion-fast)_var(--easing-exit)_reverse]',
              TONE_CLASS[t.tone],
            )}
          >
            <div className="flex flex-col gap-0.5">
              {t.title && (
                <ToastPrimitive.Title className="text-[length:var(--text-sm)] font-semibold leading-tight">
                  {t.title}
                </ToastPrimitive.Title>
              )}
              {t.description && (
                <ToastPrimitive.Description className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss notification"
              className="absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport
          className="fixed bottom-4 right-4 z-[100] flex w-auto max-w-full flex-col gap-2 outline-none"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// Low-level Radix primitives are exposed for advanced cases.
export const Toast = ToastPrimitive.Root;
export const ToastTitle = forwardRef<
  ComponentRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(function ToastTitle(props, ref) {
  return <ToastPrimitive.Title ref={ref} {...props} />;
});
export const ToastDescription = forwardRef<
  ComponentRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(function ToastDescription(props, ref) {
  return <ToastPrimitive.Description ref={ref} {...props} />;
});
