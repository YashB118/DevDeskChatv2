import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogoutButton, useAuth } from '@/features/auth';
import { routes } from '../routes';

export function DashboardLayout(): ReactElement {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-[var(--color-bg-canvas)] text-[var(--color-fg-primary)]">
      <aside
        aria-label="Primary navigation"
        className="border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4"
      >
        <div className="mb-6">
          <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">Signed in as</p>
          <p className="truncate font-medium">{user?.name ?? 'Unknown'}</p>
        </div>
        <nav className="space-y-1">
          <NavLink to={routes.dashboard()} end viewTransition className={navClass}>
            Chats
          </NavLink>
          <NavLink to={routes.settings()} viewTransition className={navClass}>
            Settings
          </NavLink>
          {isAdmin ? (
            <NavLink to={routes.admin()} viewTransition className={navClass}>
              Admin
            </NavLink>
          ) : null}
        </nav>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </aside>
      <main className="overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return [
    'block rounded-[var(--radius-sm)] px-3 py-2 text-[length:var(--text-sm)]',
    isActive
      ? 'bg-[var(--color-bg-sunken)] text-[var(--color-accent)]'
      : 'text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-sunken)]',
  ].join(' ');
}
