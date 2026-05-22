import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionsService } from './sessions.service';
import { type SessionRepository } from './session.repository';
import { type WahaService } from '@app/integrations/waha/waha.service';
import { type SocketEmitter } from '@app/realtime/socket.emitter';
import { type AuthRepository } from '@app/modules/auth/auth.repository';
import { type SessionDomain } from './session.types';
import { SessionNotFoundError } from './sessions.errors';
import { SessionId } from '@app/shared/types/ids';

function sessionDom(name: string, status: SessionDomain['status']): SessionDomain {
  return {
    id: SessionId('00000000-0000-4000-8000-000000000001'),
    name,
    status,
    config: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

interface Stubs {
  repo: SessionRepository;
  waha: WahaService;
  emitter: SocketEmitter;
  auth: { writeAudit: ReturnType<typeof vi.fn> };
}

function buildStubs(): Stubs {
  return {
    repo: {
      list: vi.fn(),
      findByName: vi.fn(),
      findById: vi.fn(),
      upsertByName: vi.fn(),
      updateStatus: vi.fn(),
      deleteByName: vi.fn(),
    } as unknown as SessionRepository,
    waha: {
      createSession: vi.fn(),
      startSession: vi.fn(),
      stopSession: vi.fn(),
      deleteSession: vi.fn(),
      getQrCode: vi.fn(),
      invalidateSession: vi.fn(),
    } as unknown as WahaService,
    emitter: { toAdmins: vi.fn() } as unknown as SocketEmitter,
    auth: { writeAudit: vi.fn() },
  };
}

describe('SessionsService', () => {
  let stubs: Stubs;
  let svc: SessionsService;

  beforeEach(() => {
    stubs = buildStubs();
    svc = new SessionsService(
      stubs.repo,
      stubs.waha,
      stubs.emitter,
      stubs.auth as unknown as AuthRepository,
    );
  });

  it('throws SessionNotFoundError when getting a missing session', async () => {
    vi.mocked(stubs.repo.findByName).mockResolvedValue(null);
    await expect(svc.get('missing')).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('create() persists row=STARTING and calls WAHA', async () => {
    const s = sessionDom('s1', 'STARTING');
    vi.mocked(stubs.repo.upsertByName).mockResolvedValue(s);
    const out = await svc.create({ name: 's1' });
    expect(stubs.repo.upsertByName).toHaveBeenCalledWith({
      name: 's1',
      status: 'STARTING',
      config: null,
    });
    expect(stubs.waha.createSession).toHaveBeenCalledWith('s1', { start: true });
    expect(out).toEqual(s);
  });

  it('stop() rejects when session is unknown', async () => {
    vi.mocked(stubs.repo.findByName).mockResolvedValue(null);
    await expect(svc.stop('ghost')).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('applyStatusUpdate updates DB, invalidates WAHA cache, emits to admins', async () => {
    const before = sessionDom('s1', 'STARTING');
    const after = sessionDom('s1', 'WORKING');
    vi.mocked(stubs.repo.findByName).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    await svc.applyStatusUpdate('s1', 'WORKING');
    expect(stubs.repo.updateStatus).toHaveBeenCalledWith('s1', 'WORKING');
    expect(stubs.waha.invalidateSession).toHaveBeenCalledWith('s1');
    expect(stubs.emitter.toAdmins).toHaveBeenCalledWith('session:status', {
      name: 's1',
      status: 'WORKING',
    });
  });

  it('applyStatusUpdate upserts when the session row is missing locally', async () => {
    vi.mocked(stubs.repo.findByName).mockResolvedValue(null);
    await svc.applyStatusUpdate('new', 'SCAN_QR_CODE');
    expect(stubs.repo.upsertByName).toHaveBeenCalledWith({
      name: 'new',
      status: 'SCAN_QR_CODE',
    });
  });
});
