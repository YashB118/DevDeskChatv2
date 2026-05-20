import { describe, expect, it, vi } from 'vitest';
import { type DataSource, type EntityManager, type QueryRunner } from 'typeorm';
import { withTransaction } from './transactions';

function buildQueryRunner(): {
  qr: QueryRunner;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const connect = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn().mockResolvedValue(undefined);
  const commit = vi.fn().mockResolvedValue(undefined);
  const rollback = vi.fn().mockResolvedValue(undefined);
  const release = vi.fn().mockResolvedValue(undefined);
  const manager = { isManager: true } as unknown as EntityManager;
  const qr = {
    connect,
    startTransaction: start,
    commitTransaction: commit,
    rollbackTransaction: rollback,
    release,
    manager,
  } as unknown as QueryRunner;
  return { qr, connect, start, commit, rollback, release };
}

function buildDataSource(qr: QueryRunner): DataSource {
  return { createQueryRunner: () => qr } as unknown as DataSource;
}

describe('withTransaction', () => {
  it('commits when the callback resolves', async () => {
    const { qr, connect, start, commit, rollback, release } = buildQueryRunner();
    const ds = buildDataSource(qr);
    const result = await withTransaction(ds, async (m) => {
      expect(m).toBe(qr.manager);
      return 42;
    });
    expect(result).toBe(42);
    expect(connect).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and rethrows on error', async () => {
    const { qr, commit, rollback, release } = buildQueryRunner();
    const ds = buildDataSource(qr);
    const boom = new Error('boom');
    await expect(
      withTransaction(ds, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('passes the isolation level through', async () => {
    const { qr, start } = buildQueryRunner();
    const ds = buildDataSource(qr);
    await withTransaction(ds, async () => undefined, { isolationLevel: 'SERIALIZABLE' });
    expect(start).toHaveBeenCalledWith('SERIALIZABLE');
  });
});
