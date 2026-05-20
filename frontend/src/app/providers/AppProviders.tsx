import type { ReactNode, ReactElement } from 'react';
import { ThemeProvider } from '@/design-system/theme';
import { ToastProvider } from '@/design-system/primitives/Toast';

interface AppProvidersProps {
  children: ReactNode;
}

// Placeholder providers — real implementations land in later phases:
//   QueryProvider     → Phase 6
//   AuthProvider      → Phase 3
//   SocketProvider    → Phase 5
//   SyncController    → Phase 5

function QueryProvider({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>;
}

function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>;
}

function SocketProvider({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>;
}

function SyncController({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>;
}

export function AppProviders({ children }: AppProvidersProps): ReactElement {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <SyncController>
              <ToastProvider>{children}</ToastProvider>
            </SyncController>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
