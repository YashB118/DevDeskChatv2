import type { ReactElement, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { BootGate } from '@/app/ui/BootGate';
import { routes } from '../routes';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps): ReactElement {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  if (status === 'initializing') return <BootGate />;
  if (!isAuthenticated) {
    return <Navigate to={routes.login()} replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
