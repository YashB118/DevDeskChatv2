import { lazy, Suspense, type ReactElement } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import { BootGate } from '@/app/ui/BootGate';
import { ProtectedRoute } from './guards/ProtectedRoute';
import { AdminRoute } from './guards/AdminRoute';
import { PublicRoute } from './guards/PublicRoute';
import { RootRedirect } from './guards/RootRedirect';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardIndexPage } from './pages/DashboardIndexPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { routePaths } from './routes';

const AdminChunk = {
  Layout: lazy(() =>
    import('./pages/admin').then((m) => ({ default: m.AdminLayout })),
  ),
  Index: lazy(() =>
    import('./pages/admin').then((m) => ({ default: m.AdminIndexPage })),
  ),
  Sessions: lazy(() =>
    import('./pages/admin').then((m) => ({ default: m.SessionsPage })),
  ),
  Assignments: lazy(() =>
    import('./pages/admin').then((m) => ({ default: m.AssignmentsPage })),
  ),
  Users: lazy(() =>
    import('./pages/admin').then((m) => ({ default: m.UsersPage })),
  ),
  Feedback: lazy(() =>
    import('./pages/admin').then((m) => ({ default: m.FeedbackPage })),
  ),
};

function withSuspense(node: ReactElement): ReactElement {
  return <Suspense fallback={<BootGate />}>{node}</Suspense>;
}

export const routeObjects: RouteObject[] = [
  {
    path: routePaths.root,
    element: <RootRedirect />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: routePaths.login,
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: routePaths.dashboard,
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <DashboardIndexPage /> },
      { path: ':chatId', element: <ChatPage /> },
    ],
  },
  {
    path: routePaths.settings,
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [{ index: true, element: <SettingsPage /> }],
  },
  {
    path: routePaths.admin,
    element: (
      <ProtectedRoute>
        <AdminRoute>{withSuspense(<AdminChunk.Layout />)}</AdminRoute>
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: withSuspense(<AdminChunk.Index />) },
      { path: 'sessions', element: withSuspense(<AdminChunk.Sessions />) },
      { path: 'assignments', element: withSuspense(<AdminChunk.Assignments />) },
      { path: 'users', element: withSuspense(<AdminChunk.Users />) },
      { path: 'feedback', element: withSuspense(<AdminChunk.Feedback />) },
    ],
  },
  {
    path: routePaths.notFound,
    element: <NotFoundPage />,
    errorElement: <RouteErrorBoundary />,
  },
];

export const router = createBrowserRouter(routeObjects);

export function AppRouter(): ReactElement {
  return <RouterProvider router={router} />;
}
