import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const DUMMY_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ndummy\n-----END PRIVATE KEY-----';
const DUMMY_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\ndummy\n-----END PUBLIC KEY-----';

const baseEnv = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/devdesk',
  REDIS_URL: 'redis://localhost:6379',
  JWT_PRIVATE_KEY: DUMMY_PRIVATE_KEY,
  JWT_PUBLIC_KEY: DUMMY_PUBLIC_KEY,
};

describe('loadEnv', () => {
  it('parses defaults when only required vars are set', () => {
    const config = loadEnv(baseEnv);
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3005);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173']);
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.PG_POOL_MAX).toBe(20);
    expect(config.PG_STATEMENT_TIMEOUT_MS).toBe(5000);
    expect(config.REDIS_KEY_PREFIX).toBe('devdesk:');
  });

  it('coerces PORT from string', () => {
    const config = loadEnv({ ...baseEnv, PORT: '4000' });
    expect(config.PORT).toBe(4000);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadEnv({ ...baseEnv, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadEnv({ ...baseEnv, LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL/);
  });

  it('splits CORS_ORIGINS on commas', () => {
    const config = loadEnv({ ...baseEnv, CORS_ORIGINS: 'http://a,http://b , http://c' });
    expect(config.CORS_ORIGINS).toEqual(['http://a', 'http://b', 'http://c']);
  });

  it('parses TRUST_PROXY booleans', () => {
    expect(loadEnv({ ...baseEnv, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...baseEnv, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...baseEnv, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
  });

  it('rejects when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = baseEnv;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects when REDIS_URL is missing', () => {
    const { REDIS_URL: _omit, ...rest } = baseEnv;
    expect(() => loadEnv(rest)).toThrow(/REDIS_URL/);
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => loadEnv({ ...baseEnv, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });

  it('rejects when JWT keys are missing', () => {
    const { JWT_PRIVATE_KEY: _o1, JWT_PUBLIC_KEY: _o2, ...rest } = baseEnv;
    expect(() => loadEnv(rest)).toThrow(/JWT_PRIVATE_KEY/);
  });

  it('normalizes escaped \\n into real newlines in PEM keys', () => {
    const config = loadEnv({
      ...baseEnv,
      JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nABCD\\n-----END PRIVATE KEY-----',
    });
    expect(config.JWT_PRIVATE_KEY).toBe(
      '-----BEGIN PRIVATE KEY-----\nABCD\n-----END PRIVATE KEY-----',
    );
  });
});
