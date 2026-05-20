import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppErrorBoundary } from './AppErrorBoundary';

function Boom(): never {
  throw new Error('kaboom');
}

describe('AppErrorBoundary', () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders the fallback UI when a child throws', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
  });

  it('dispatches a window app:error event on catch', () => {
    const listener = vi.fn();
    window.addEventListener('app:error', listener);
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('app:error', listener);
  });

  it('renders children when no error occurs', () => {
    render(
      <AppErrorBoundary>
        <p>healthy</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });
});
