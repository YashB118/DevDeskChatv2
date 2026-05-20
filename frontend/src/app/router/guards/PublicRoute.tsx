import type { ReactElement, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { BootGate } from '@/app/ui/BootGate';
import { routes } from '../routes';

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps): ReactElement {
  const { status, isAuthenticated } = useAuth();

  if (status === 'initializing') return <BootGate />;
  if (isAuthenticated) {
    return <Navigate to={routes.dashboard()} replace />;
  }
  return <>{children}</>;
}
