import { afterEach, describe, expect, it } from 'vitest';
import { clearAccessToken, getAccessToken, setAccessToken } from './memory';

describe('access token memory storage', () => {
  afterEach(() => {
    clearAccessToken();
  });

  it('starts unset', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('round-trips a value', () => {
    setAccessToken('abc');
    expect(getAccessToken()).toBe('abc');
  });

  it('clears on demand', () => {
    setAccessToken('abc');
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it('never touches localStorage', () => {
    setAccessToken('secret');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(Object.values(localStorage)).not.toContain('secret');
  });
});
