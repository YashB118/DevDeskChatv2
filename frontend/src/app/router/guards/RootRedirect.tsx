import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { BootGate } from '@/app/ui/BootGate';
import { routes } from '../routes';

export function RootRedirect(): ReactElement {
  const { status, isAuthenticated } = useAuth();

  if (status === 'initializing') return <BootGate />;
  return <Navigate to={isAuthenticated ? routes.dashboard() : routes.login()} replace />;
}
