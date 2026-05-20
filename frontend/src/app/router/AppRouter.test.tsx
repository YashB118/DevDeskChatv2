import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Suspense, lazy, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetAuthState, setAuthState } from '@/features/auth/store/auth.store';
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

// Mirror routeObjects from AppRouter using JSX <Route>s so we can drive them
// with <MemoryRouter>. The data router (createMemoryRouter) uses Web Fetch
// primitives internally that don't interop cleanly with jsdom + undici in
// Vitest; the legacy <Routes> runtime sidesteps that.
const AdminChunk = {
  Layout: lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminLayout }))),
  Index: lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminIndexPage }))),
  Sessions: lazy(() => import('./pages/admin').then((m) => ({ default: m.SessionsPage }))),
};

function withSuspense(node: ReactElement): ReactElement {
  return <Suspense fallback={<BootGate />}>{node}</Suspense>;
}

function DashboardOutlet(): ReactElement {
  return (
    <ProtectedRoute>
      <DashboardLayout />
    </ProtectedRoute>
  );
}

function AdminOutlet(): ReactElement {
  return (
    <ProtectedRoute>
      <AdminRoute>{withSuspense(<AdminChunk.Layout />)}</AdminRoute>
    </ProtectedRoute>
  );
}

function renderAt(path: string): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 0, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route path="/dashboard" element={<DashboardOutlet />}>
          <Route index element={<DashboardIndexPage />} />
          <Route path=":chatId" element={<ChatPage />} />
        </Route>
        <Route path="/settings" element={<DashboardOutlet />}>
          <Route index element={<SettingsPage />} />
        </Route>
        <Route path="/admin" element={<AdminOutlet />}>
          <Route index element={withSuspense(<AdminChunk.Index />)} />
          <Route path="sessions" element={withSuspense(<AdminChunk.Sessions />)} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  resetAuthState();
});

describe('AppRouter — guards', () => {
  it('redirects unauthenticated user from /dashboard to /login', async () => {
    setAuthState({ status: 'unauthenticated', user: null, error: null });
    renderAt('/dashboard');
    await screen.findByRole('form', { name: /sign in/i });
  });

  it('redirects unauthenticated user from /admin to /login', async () => {
    setAuthState({ status: 'unauthenticated', user: null, error: null });
    renderAt('/admin');
    await screen.findByRole('form', { name: /sign in/i });
  });

  it('redirects a non-admin developer from /admin to /dashboard', async () => {
    setAuthState({
      status: 'authenticated',
      user: { id: 'u1', email: 'dev@example.com', displayName: 'Dev', role: 'DEVELOPER' },
      error: null,
    });
    renderAt('/admin');
    await waitFor(() => {
      expect(screen.getByText(/Pick a chat/i)).toBeInTheDocument();
    });
  });

  it('renders admin shell for an admin user at /admin/sessions', async () => {
    setAuthState({
      status: 'authenticated',
      user: { id: 'u2', email: 'a@example.com', displayName: 'Admin', role: 'ADMIN' },
      error: null,
    });
    renderAt('/admin/sessions');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Admin$/i })).toBeInTheDocument();
    });
    expect(await screen.findByText(/Session management ships/i)).toBeInTheDocument();
  });

  it('redirects an authenticated user away from /login to /dashboard', async () => {
    setAuthState({
      status: 'authenticated',
      user: { id: 'u3', email: 'x@example.com', displayName: 'X', role: 'DEVELOPER' },
      error: null,
    });
    renderAt('/login');
    await waitFor(() => {
      expect(screen.getByText(/Pick a chat/i)).toBeInTheDocument();
    });
  });

  it('root redirects authenticated user to /dashboard', async () => {
    setAuthState({
      status: 'authenticated',
      user: { id: 'u4', email: 'r@example.com', displayName: 'R', role: 'DEVELOPER' },
      error: null,
    });
    renderAt('/');
    await waitFor(() => {
      expect(screen.getByText(/Pick a chat/i)).toBeInTheDocument();
    });
  });

  it('root redirects unauthenticated user to /login', async () => {
    setAuthState({ status: 'unauthenticated', user: null, error: null });
    renderAt('/');
    await screen.findByRole('form', { name: /sign in/i });
  });

  it('shows BootGate while auth is initializing', () => {
    setAuthState({ status: 'initializing', user: null, error: null });
    renderAt('/dashboard');
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });
});

describe('AppRouter — 404', () => {
  it('renders NotFoundPage for unknown routes', async () => {
    setAuthState({ status: 'unauthenticated', user: null, error: null });
    renderAt('/this-route-does-not-exist');
    expect(await screen.findByText(/Page not found/i)).toBeInTheDocument();
  });
});

describe('AppRouter — chat id param', () => {
  it('renders ChatPage with branded chat id', async () => {
    setAuthState({
      status: 'authenticated',
      user: { id: 'u5', email: 'c@example.com', displayName: 'C', role: 'DEVELOPER' },
      error: null,
    });
    renderAt('/dashboard/chat-123');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'chat-123' })).toBeInTheDocument();
    });
  });
});
