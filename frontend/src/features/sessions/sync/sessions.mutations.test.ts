import { describe, it, expect } from 'vitest';
import { applySessionStatus } from './sessions.mutations';
import type { SessionList } from '../types';

function list(): SessionList {
  return {
    sessions: [
      { id: 's-1', name: 'alpha', status: 'STOPPED', config: null, createdAt: '0', updatedAt: '0' },
      { id: 's-2', name: 'beta', status: 'WORKING', config: null, createdAt: '0', updatedAt: '0' },
    ],
  };
}

describe('sessions sync mutations', () => {
  it('flips status on the named session only', () => {
    const next = applySessionStatus(list(), { name: 'alpha', status: 'SCAN_QR_CODE' });
    expect(next!.sessions[0]!.status).toBe('SCAN_QR_CODE');
    expect(next!.sessions[1]!.status).toBe('WORKING');
  });

  it('is a no-op for unknown session name (passes through)', () => {
    const data = list();
    const next = applySessionStatus(data, { name: 'gamma', status: 'FAILED' });
    expect(next!.sessions.find((s) => s.status === 'FAILED')).toBeUndefined();
  });

  it('returns undefined when source is undefined', () => {
    expect(applySessionStatus(undefined, { name: 'x', status: 'WORKING' })).toBeUndefined();
  });
});
