import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Component, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useChatIdParam } from './useChatIdParam';

function Probe(): ReactElement {
  const chatId = useChatIdParam();
  return <span data-testid="probe">{chatId}</span>;
}

class CatchBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  override state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error): { err: Error } {
    return { err };
  }
  override render(): ReactNode {
    if (this.state.err) return <span data-testid="err">bad</span>;
    return this.props.children;
  }
}

describe('useChatIdParam', () => {
  it('returns the branded chat id from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/c/abc.123']}>
        <Routes>
          <Route path="/c/:chatId" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('abc.123');
  });

  it('throws on an invalid id payload', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/c/has%20space']}>
        <CatchBoundary>
          <Routes>
            <Route path="/c/:chatId" element={<Probe />} />
          </Routes>
        </CatchBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('err')).toBeInTheDocument();
    spy.mockRestore();
  });
});
