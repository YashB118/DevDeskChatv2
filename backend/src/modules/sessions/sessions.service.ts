import { Injectable, Logger } from '@nestjs/common';
import { WahaService } from '@app/integrations/waha/waha.service';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { AuthRepository } from '@app/modules/auth/auth.repository';
import { ExternalServiceError } from '@app/shared/errors';
import { type UserId } from '@app/shared/types/ids';
import { SessionRepository } from './session.repository';
import { type SessionDomain, type SessionStatus } from './session.types';
import { type CreateSessionInput } from './session.schema';
import { SessionNotFoundError } from './sessions.errors';

function isUpstreamUnknownSession(err: unknown): boolean {
  if (!(err instanceof ExternalServiceError)) return false;
  const status = (err.details as { status?: number } | undefined)?.status;
  return status === 404 || status === 422;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly repo: SessionRepository,
    private readonly waha: WahaService,
    private readonly emitter: SocketEmitter,
    private readonly auth: AuthRepository,
  ) {}

  list(): Promise<SessionDomain[]> {
    return this.repo.list();
  }

  async get(name: string): Promise<SessionDomain> {
    const row = await this.repo.findByName(name);
    if (row === null) throw new SessionNotFoundError(name);
    return row;
  }

  async create(input: CreateSessionInput, actorId: UserId | null = null): Promise<SessionDomain> {
    const session = await this.repo.upsertByName({
      name: input.name,
      status: 'STARTING',
      config: input.config ?? null,
    });
    // WAHA requires `POST /api/sessions` to register the session before
    // `/start` accepts it (returns 422 otherwise). Fuse create+start with
    // `start: true` so a fresh session reaches SCAN_QR_CODE in one round-trip.
    const createOptions: { start: boolean; config?: unknown } = { start: true };
    if (input.config !== undefined) createOptions.config = input.config;
    try {
      await this.waha.createSession(input.name, createOptions);
    } catch (err) {
      // Compensating action: flip local state to FAILED so the UI doesn't
      // hang forever on STARTING. Audit the failure for forensics.
      await this.repo.updateStatus(input.name, 'FAILED');
      await this.auth.writeAudit('session.create_failed', actorId, {
        name: input.name,
        error: (err as Error).message,
      });
      throw err;
    }
    await this.auth.writeAudit('session.create', actorId, { name: input.name });
    return session;
  }

  async start(name: string, actorId: UserId | null = null): Promise<SessionDomain> {
    const session = await this.repo.upsertByName({ name, status: 'STARTING' });
    await this.waha.startSession(name);
    await this.auth.writeAudit('session.start', actorId, { name });
    return session;
  }

  async stop(name: string, actorId: UserId | null = null): Promise<SessionDomain> {
    await this.assertExists(name);
    try {
      await this.waha.stopSession(name);
    } catch (err) {
      // WAHA may not know about this session anymore (e.g. wiped container,
      // drift). Still flip local state to STOPPED so the UI unwedges.
      if (!isUpstreamUnknownSession(err)) throw err;
      this.logger.warn(`stop(${name}): WAHA reports unknown; clearing local state anyway`);
    }
    await this.repo.updateStatus(name, 'STOPPED');
    await this.auth.writeAudit('session.stop', actorId, { name });
    return this.get(name);
  }

  async delete(name: string, actorId: UserId | null = null): Promise<void> {
    await this.assertExists(name);
    try {
      await this.waha.deleteSession(name);
    } catch (err) {
      if (!isUpstreamUnknownSession(err)) throw err;
      this.logger.warn(`delete(${name}): WAHA reports unknown; removing local row anyway`);
    }
    await this.repo.deleteByName(name);
    await this.auth.writeAudit('session.delete', actorId, { name });
  }

  qr(name: string): Promise<{ mimetype: string; data: string }> {
    return this.waha.getQrCode(name);
  }

  /**
   * Webhook-driven update. Updates the local row, invalidates the WAHA
   * status cache, and pushes `session:status` to the admin room.
   */
  async applyStatusUpdate(name: string, status: SessionStatus): Promise<void> {
    const existing = await this.repo.findByName(name);
    if (existing === null) {
      await this.repo.upsertByName({ name, status });
    } else if (existing.status !== status) {
      await this.repo.updateStatus(name, status);
    }
    this.waha.invalidateSession(name);
    this.emitter.toAdmins('session:status', { name, status });
    this.logger.debug(`session ${name} status -> ${status}`);
  }

  private async assertExists(name: string): Promise<void> {
    const row = await this.repo.findByName(name);
    if (row === null) throw new SessionNotFoundError(name);
  }
}
