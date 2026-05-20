import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';
import { ExternalServiceError } from '@app/shared/errors';

function build(
  now: { t: number },
  overrides: Partial<{ failureThreshold: number; cooldownMs: number }> = {},
): CircuitBreaker {
  return new CircuitBreaker({
    name: 'test',
    failureThreshold: overrides.failureThreshold ?? 3,
    cooldownMs: overrides.cooldownMs ?? 1000,
    now: () => now.t,
  });
}

describe('CircuitBreaker', () => {
  it('passes successful calls through when closed', async () => {
    const now = { t: 0 };
    const cb = build(now);
    await expect(cb.exec(async () => 'ok')).resolves.toBe('ok');
    expect(cb.status().state).toBe('closed');
  });

  it('opens after N consecutive failures', async () => {
    const now = { t: 0 };
    const cb = build(now, { failureThreshold: 3 });
    for (let i = 0; i < 3; i += 1) {
      await expect(
        cb.exec(async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    }
    expect(cb.status().state).toBe('open');
  });

  it('short-circuits with ExternalServiceError while open within cooldown', async () => {
    const now = { t: 0 };
    const cb = build(now, { failureThreshold: 2, cooldownMs: 500 });
    for (let i = 0; i < 2; i += 1) {
      await cb
        .exec(async () => {
          throw new Error('boom');
        })
        .catch(() => undefined);
    }
    now.t = 100;
    await expect(cb.exec(async () => 'ok')).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('transitions to half-open after cooldown and recovers on success', async () => {
    const now = { t: 0 };
    const cb = build(now, { failureThreshold: 2, cooldownMs: 500 });
    for (let i = 0; i < 2; i += 1) {
      await cb
        .exec(async () => {
          throw new Error('boom');
        })
        .catch(() => undefined);
    }
    expect(cb.status().state).toBe('open');
    now.t = 600;
    await expect(cb.exec(async () => 'ok')).resolves.toBe('ok');
    expect(cb.status().state).toBe('closed');
  });

  it('re-opens immediately if half-open probe fails', async () => {
    const now = { t: 0 };
    const cb = build(now, { failureThreshold: 2, cooldownMs: 500 });
    for (let i = 0; i < 2; i += 1) {
      await cb
        .exec(async () => {
          throw new Error('boom');
        })
        .catch(() => undefined);
    }
    now.t = 600;
    await expect(
      cb.exec(async () => {
        throw new Error('still bad');
      }),
    ).rejects.toThrow('still bad');
    expect(cb.status().state).toBe('open');
  });

  it('resets consecutive failures on a success in closed state', async () => {
    const now = { t: 0 };
    const cb = build(now, { failureThreshold: 3 });
    await cb
      .exec(async () => {
        throw new Error('a');
      })
      .catch(() => undefined);
    await cb
      .exec(async () => {
        throw new Error('b');
      })
      .catch(() => undefined);
    expect(cb.status().consecutiveFailures).toBe(2);
    await cb.exec(async () => 'ok');
    expect(cb.status().consecutiveFailures).toBe(0);
  });
});
