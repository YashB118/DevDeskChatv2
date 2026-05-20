import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { routes } from '../routes';

export function AdminLayout(): ReactElement {
  return (
    <div className="flex h-full min-h-screen flex-col bg-[var(--color-bg-canvas)] text-[var(--color-fg-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] px-6 py-3">
        <h1 className="text-[length:var(--text-lg)] font-semibold">Admin</h1>
        <nav aria-label="Admin sections" className="mt-2 flex gap-2">
          <NavLink to={routes.adminSessions()} viewTransition className={navClass}>
            Sessions
          </NavLink>
          <NavLink to={routes.adminAssignments()} viewTransition className={navClass}>
            Assignments
          </NavLink>
          <NavLink to={routes.adminUsers()} viewTransition className={navClass}>
            Users
          </NavLink>
          <NavLink to={routes.adminFeedback()} viewTransition className={navClass}>
            Feedback
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return [
    'rounded-[var(--radius-sm)] px-3 py-1 text-[length:var(--text-sm)]',
    isActive
      ? 'bg-[var(--color-bg-sunken)] text-[var(--color-accent)]'
      : 'text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-sunken)]',
  ].join(' ');
}
