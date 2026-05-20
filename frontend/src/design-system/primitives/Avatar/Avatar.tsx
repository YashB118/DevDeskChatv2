import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ComponentRef } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils';

const avatarVariants = cva(
  'inline-flex shrink-0 overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-secondary)] select-none items-center justify-center',
  {
    variants: {
      size: {
        sm: 'h-6 w-6 text-[10px]',
        md: 'h-9 w-9 text-[length:var(--text-sm)]',
        lg: 'h-12 w-12 text-[length:var(--text-md)]',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

type RootProps = ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>;
type RootRef = ComponentRef<typeof AvatarPrimitive.Root>;

export type AvatarProps = RootProps & VariantProps<typeof avatarVariants>;

export const Avatar = forwardRef<RootRef, AvatarProps>(function Avatar(
  { className, size, ...props },
  ref,
) {
  return <AvatarPrimitive.Root ref={ref} className={cn(avatarVariants({ size }), className)} {...props} />;
});

export const AvatarImage = forwardRef<
  ComponentRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(function AvatarImage({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn('h-full w-full object-cover', className)}
      {...props}
    />
  );
});

export const AvatarFallback = forwardRef<
  ComponentRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn('flex h-full w-full items-center justify-center font-medium', className)}
      {...props}
    />
  );
});
