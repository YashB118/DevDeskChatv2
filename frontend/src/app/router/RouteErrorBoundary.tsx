import type { ReactElement } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button } from '@/design-system/primitives/Button';

export function RouteErrorBoundary(): ReactElement {
  const error = useRouteError();

  const { title, message } = formatError(error);

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg-canvas)] p-6 text-center text-[var(--color-fg-primary)]"
    >
      <h1 className="text-[length:var(--text-xl)] font-semibold">{title}</h1>
      <p className="max-w-sm text-[var(--color-fg-muted)]">{message}</p>
      <Button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </Button>
    </div>
  );
}

function formatError(error: unknown): { title: string; message: string } {
  if (isRouteErrorResponse(error)) {
    return {
      title: `Error ${String(error.status)}`,
      message: error.statusText || 'This route could not be loaded.',
    };
  }
  if (error instanceof Error) {
    return { title: 'Something went wrong', message: error.message };
  }
  return { title: 'Something went wrong', message: 'Unknown error.' };
}
