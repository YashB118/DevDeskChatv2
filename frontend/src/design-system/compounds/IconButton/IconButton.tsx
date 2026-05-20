import { forwardRef } from 'react';
import { Button } from '@/design-system/primitives/Button';
import type { ButtonProps } from '@/design-system/primitives/Button';

export interface IconButtonProps extends Omit<ButtonProps, 'leadingIcon' | 'trailingIcon' | 'children'> {
  label: string;
  icon: ButtonProps['leadingIcon'];
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'icon', variant = 'ghost', ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      size={size}
      variant={variant}
      {...props}
    >
      <span aria-hidden className="inline-flex">{icon}</span>
    </Button>
  );
});
