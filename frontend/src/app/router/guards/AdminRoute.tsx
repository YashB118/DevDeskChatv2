import type { ReactElement, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { BootGate } from '@/app/ui/BootGate';
import { routes } from '../routes';

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps): ReactElement {
  const { status, user } = useAuth();

  if (status === 'initializing') return <BootGate />;
  if (user?.role !== 'ADMIN') {
    return <Navigate to={routes.dashboard()} replace />;
  }
  return <>{children}</>;
}
