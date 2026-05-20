import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogoutButton, useAuth } from '@/features/auth';
import { ChatSidebar, useSyncActiveChatFromUrl } from '@/features/chats';
import { ConnectionBanner } from '@/realtime';
import { routes } from '../routes';

export function DashboardLayout(): ReactElement {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  useSyncActiveChatFromUrl();

  return (
    <div className="grid min-h-screen grid-cols-[240px_320px_1fr] grid-rows-[auto_1fr] bg-[var(--color-bg-canvas)] text-[var(--color-fg-primary)]">
      <div className="col-span-3">
        <ConnectionBanner />
      </div>
      <aside
        aria-label="Primary navigation"
        className="flex h-full min-h-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4"
      >
        <div className="mb-6">
          <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">Signed in as</p>
          <p className="truncate font-medium">{user?.displayName ?? 'Unknown'}</p>
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
        <div className="mt-auto">
          <LogoutButton />
        </div>
      </aside>
      <aside
        aria-label="Chat list"
        className="min-h-0 overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)]"
      >
        <ChatSidebar />
      </aside>
      <main className="min-h-0 overflow-hidden">
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
