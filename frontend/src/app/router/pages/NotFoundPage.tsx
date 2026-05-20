import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { routes } from '../routes';

export function NotFoundPage(): ReactElement {
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg-canvas)] p-6 text-center text-[var(--color-fg-primary)]"
    >
      <h1 className="text-[length:var(--text-2xl)] font-semibold">Page not found</h1>
      <p className="max-w-sm text-[var(--color-fg-muted)]">
        The page you tried to open does not exist.
      </p>
      <Link
        to={routes.root()}
        className="inline-flex h-10 items-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 text-[length:var(--text-sm)] font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)]"
      >
        Go home
      </Link>
    </div>
  );
}
