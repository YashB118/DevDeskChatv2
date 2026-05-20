import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/tests/mocks/server';
import { env } from '@/lib/env';
import { toChatId } from '@/shared/types/ids';
import { setAuthState, resetAuthState } from '@/features/auth/store/auth.store';
import { MessageComposer } from './MessageComposer';

function wrap(node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  function W({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return <W>{node}</W>;
}

beforeEach(() => {
  resetAuthState();
  setAuthState({
    status: 'authenticated',
    user: { id: 'u-1', email: 'a@b.c', displayName: 'A', role: 'DEVELOPER' },
    error: null,
  });
});

describe('MessageComposer', () => {
  it('Enter submits, Shift+Enter inserts newline', async () => {
    const seen = vi.fn();
    server.use(
      http.post(`${env.VITE_API_BASE_URL}/api/messages/:chatId/send`, async ({ request }) => {
        const body = (await request.json()) as { body: string };
        seen(body.body);
        return HttpResponse.json(
          {
            id: 'srv-1',
            chatId: 'c-1',
            senderId: 'u-1',
            body: body.body,
            type: 'TEXT',
            ts: Date.now(),
            reactions: [],
            forwarded: false,
            status: 'confirmed',
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    render(wrap(<MessageComposer chatId={toChatId('c-1')} />));
    const textarea = screen.getByLabelText('Message');

    await user.type(textarea, 'line1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'line2');
    expect((textarea as HTMLTextAreaElement).value).toBe('line1\nline2');

    await user.keyboard('{Enter}');
    expect(seen).toHaveBeenCalledWith('line1\nline2');
  });

  it('does not submit when the trimmed body is empty', async () => {
    const seen = vi.fn();
    server.use(
      http.post(`${env.VITE_API_BASE_URL}/api/messages/:chatId/send`, () => {
        seen();
        return HttpResponse.json({}, { status: 200 });
      }),
    );

    const user = userEvent.setup();
    render(wrap(<MessageComposer chatId={toChatId('c-1')} />));
    await user.type(screen.getByLabelText('Message'), '   ');
    await user.keyboard('{Enter}');
    expect(seen).not.toHaveBeenCalled();
  });
});
