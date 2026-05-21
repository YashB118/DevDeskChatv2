import type { ReactNode, ReactElement } from 'react';
import { ThemeProvider } from '@/design-system/theme';
import { ToastProvider } from '@/design-system/primitives/Toast';
import { AuthProvider } from '@/features/auth';
import { QueryProvider } from '@/app/providers/QueryProvider';
import { SocketProvider, SyncController } from '@/realtime';
import { NotificationController } from '@/app/notifications/NotificationController';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps): ReactElement {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <SyncController>
              <ToastProvider>
                <NotificationController>{children}</NotificationController>
              </ToastProvider>
            </SyncController>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
