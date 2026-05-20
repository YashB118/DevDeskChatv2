import type { ReactElement } from 'react';
import { AppErrorBoundary } from '@/app/errors/AppErrorBoundary';
import { AppProviders } from '@/app/providers/AppProviders';
import { BootGate } from '@/app/ui/BootGate';
import { Styleguide } from '@/app/ui/Styleguide';

function isStyleguidePath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/__styleguide';
}

export function App(): ReactElement {
  const showStyleguide = import.meta.env.DEV && isStyleguidePath();

  return (
    <AppErrorBoundary>
      <AppProviders>
        {showStyleguide ? <Styleguide /> : <BootGate />}
      </AppProviders>
    </AppErrorBoundary>
  );
}
