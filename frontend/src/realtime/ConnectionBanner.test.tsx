import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ConnectionBanner } from './ConnectionBanner';
import { useConnectionStatusStore } from './connectionStatusStore';

describe('ConnectionBanner', () => {
  beforeEach(() => {
    useConnectionStatusStore.getState().reset();
  });

  it('renders nothing when connected', () => {
    act(() => { useConnectionStatusStore.getState().setStatus('connected'); });
    const { container } = render(<ConnectionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when idle', () => {
    const { container } = render(<ConnectionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows reconnecting copy', () => {
    render(<ConnectionBanner />);
    act(() => { useConnectionStatusStore.getState().setStatus('reconnecting'); });
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  });

  it('shows offline copy', () => {
    render(<ConnectionBanner />);
    act(() => { useConnectionStatusStore.getState().setStatus('offline'); });
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
  });
});
