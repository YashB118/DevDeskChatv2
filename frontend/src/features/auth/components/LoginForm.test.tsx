import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LoginForm } from './LoginForm';
import { resetAuthState } from '../store/auth.store';
import { _resetRefreshState } from '@/lib/http/retry';
import { clearAccessToken, getAccessToken } from '@/lib/storage/memory';
import { server } from '@/tests/mocks/server';

const base = 'http://localhost:3005';

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => {
  server.resetHandlers();
  _resetRefreshState();
  clearAccessToken();
  resetAuthState();
});
afterAll(() => { server.close(); });

beforeEach(() => {
  resetAuthState();
});

describe('LoginForm', () => {
  it('shows validation errors for empty submit', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('submits and stores token + user on success', async () => {
    server.use(
      http.post(`${base}/api/auth/login`, () =>
        HttpResponse.json({
          accessToken: 'tok-xyz',
          user: { id: 'u1', email: 'a@b.com', name: 'Ada', role: 'developer' },
        }),
      ),
    );

    const user = userEvent.setup();
    let succeeded = false;
    render(<LoginForm onSuccess={() => { succeeded = true; }} />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'longpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByRole('button', { name: /sign in/i });
    expect(getAccessToken()).toBe('tok-xyz');
    expect(succeeded).toBe(true);
  });

  it('surfaces a field error for INVALID_CREDENTIALS', async () => {
    server.use(
      http.post(`${base}/api/auth/login`, () =>
        new HttpResponse(
          JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'bad' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'longpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/email or password is incorrect/i)).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });
});
