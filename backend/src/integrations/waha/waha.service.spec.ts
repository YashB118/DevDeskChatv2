import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig } from '@app/config/env';
import { ExternalServiceError } from '@app/shared/errors';
import { WahaService } from './waha.service';
import { type WahaClient } from './waha.client';
import { type WahaSession } from './waha.types';

function buildEnv(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    WAHA_RETRY_MAX: 2,
    WAHA_RETRY_BASE_MS: 1,
    WAHA_CB_FAILURE_THRESHOLD: 3,
    WAHA_CB_COOLDOWN_MS: 1000,
    WAHA_SESSIONS_CACHE_TTL_MS: 10_000,
    WAHA_CHATS_CACHE_TTL_MS: 10_000,
    WAHA_STATUS_CACHE_TTL_MS: 5_000,
    ...overrides,
  } as AppConfig;
}

function makeClientStub(): WahaClient {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    deleteSession: vi.fn(),
    getQrCode: vi.fn(),
    listChats: vi.fn(),
    listMessages: vi.fn(),
    sendText: vi.fn(),
    sendMedia: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    reactToMessage: vi.fn(),
    forwardMessage: vi.fn(),
  } as unknown as WahaClient;
}

function externalError(status: number): ExternalServiceError {
  return new ExternalServiceError(`upstream ${String(status)}`, {
    code: 'WAHA_5XX',
    details: { status },
  });
}

describe('WahaService', () => {
  let client: WahaClient;

  beforeEach(() => {
    client = makeClientStub();
  });

  it('caches listSessions within TTL and refreshes on invalidate', async () => {
    const sessions: WahaSession[] = [{ name: 's1', status: 'WORKING' }];
    vi.mocked(client.listSessions).mockResolvedValue(sessions);
    const svc = new WahaService(buildEnv(), client);

    await svc.listSessions();
    await svc.listSessions();
    expect(client.listSessions).toHaveBeenCalledTimes(1);

    svc.invalidateSession('s1');
    await svc.listSessions();
    expect(client.listSessions).toHaveBeenCalledTimes(2);
  });

  it('retries idempotent calls on 5xx and eventually succeeds', async () => {
    const ok: WahaSession = { name: 's1', status: 'WORKING' };
    vi.mocked(client.getSession)
      .mockRejectedValueOnce(externalError(503))
      .mockRejectedValueOnce(externalError(502))
      .mockResolvedValueOnce(ok);
    const svc = new WahaService(buildEnv(), client);
    await expect(svc.getSession('s1')).resolves.toEqual(ok);
    expect(client.getSession).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx responses', async () => {
    const err = new ExternalServiceError('bad request', {
      code: 'WAHA_HTTP_ERROR',
      details: { status: 400 },
    });
    vi.mocked(client.getSession).mockRejectedValue(err);
    const svc = new WahaService(buildEnv(), client);
    await expect(svc.getSession('s1')).rejects.toBe(err);
    expect(client.getSession).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit and short-circuits subsequent calls', async () => {
    vi.mocked(client.getSession).mockRejectedValue(externalError(500));
    const svc = new WahaService(
      buildEnv({ WAHA_RETRY_MAX: 0, WAHA_CB_FAILURE_THRESHOLD: 2, WAHA_CB_COOLDOWN_MS: 60_000 }),
      client,
    );
    await svc.getSession('s1').catch(() => undefined);
    await svc.getSession('s1').catch(() => undefined);
    const blocked = await svc.getSession('s1').catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(ExternalServiceError);
    expect((blocked as ExternalServiceError).code).toBe('WAHA_UNAVAILABLE');
    expect(svc.circuitStatus('getSession')?.state).toBe('open');
  });

  it('never retries mutations', async () => {
    vi.mocked(client.sendText).mockRejectedValueOnce(externalError(500));
    const svc = new WahaService(buildEnv(), client);
    await expect(svc.sendText({ session: 's', chatId: 'c', text: 'hi' })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    expect(client.sendText).toHaveBeenCalledTimes(1);
  });

  it('invalidates session cache after startSession succeeds', async () => {
    const before: WahaSession = { name: 's1', status: 'STOPPED' };
    const after: WahaSession = { name: 's1', status: 'STARTING' };
    vi.mocked(client.getSession).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    vi.mocked(client.startSession).mockResolvedValueOnce(after);

    const svc = new WahaService(buildEnv(), client);
    expect(await svc.getSession('s1')).toEqual(before);
    await svc.startSession('s1');
    expect(await svc.getSession('s1')).toEqual(after);
    expect(client.getSession).toHaveBeenCalledTimes(2);
  });
});
