import { useState, type ReactElement } from 'react';
import { Button, type ButtonProps } from '@/design-system/primitives/Button';
import { useAuth } from '../hooks/useAuth';

type LogoutButtonProps = Omit<ButtonProps, 'onClick' | 'children'> & {
  label?: string;
};

export function LogoutButton({ label = 'Sign out', ...rest }: LogoutButtonProps): ReactElement {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      {...rest}
      isLoading={pending}
      onClick={() => {
        setPending(true);
        void logout().finally(() => { setPending(false); });
      }}
    >
      {label}
    </Button>
  );
}
