import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { routes } from '../../routes';

export function AdminIndexPage(): ReactElement {
  return <Navigate to={routes.adminSessions()} replace />;
}
