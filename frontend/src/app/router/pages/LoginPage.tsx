import type { ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoginForm } from '@/features/auth';
import { routes } from '../routes';

interface LocationState {
  from?: string;
}

export function LoginPage(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? routes.dashboard();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-canvas)] p-6 text-[var(--color-fg-primary)]">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-6 shadow">
        <h1 className="mb-4 text-[length:var(--text-xl)] font-semibold">Sign in</h1>
        <LoginForm
          onSuccess={() => {
            void navigate(from, { replace: true, viewTransition: true });
          }}
        />
      </div>
    </div>
  );
}
