import { describe, it, expect } from 'vitest';
import { parseEnv } from './env';

describe('env.parseEnv', () => {
  it('parses a full valid env', () => {
    const parsed = parseEnv({
      VITE_API_BASE_URL: 'https://api.example.com',
      VITE_SOCKET_URL: 'https://socket.example.com',
      VITE_APP_ENV: 'production',
      VITE_SENTRY_DSN: 'https://sentry.example/abc',
    });
    expect(parsed.VITE_APP_ENV).toBe('production');
    expect(parsed.VITE_API_BASE_URL).toBe('https://api.example.com');
  });

  it('throws when required vars are missing', () => {
    expect(() => parseEnv({})).toThrow(/Invalid frontend env config/);
  });

  it('throws when URL fields are malformed', () => {
    expect(() =>
      parseEnv({
        VITE_API_BASE_URL: 'not-a-url',
        VITE_SOCKET_URL: 'also-bad',
      }),
    ).toThrow(/Invalid frontend env config/);
  });
});
