import { Injectable, Logger } from '@nestjs/common';
import { WahaService } from '@app/integrations/waha/waha.service';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { AuthRepository } from '@app/modules/auth/auth.repository';
import { type UserId } from '@app/shared/types/ids';
import { SessionRepository } from './session.repository';
import { type SessionDomain, type SessionStatus } from './session.types';
import { type CreateSessionInput } from './session.schema';
import { SessionNotFoundError } from './sessions.errors';

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
    await this.waha.startSession(input.name);
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
    await this.waha.stopSession(name);
    await this.repo.updateStatus(name, 'STOPPED');
    await this.auth.writeAudit('session.stop', actorId, { name });
    return this.get(name);
  }

  async delete(name: string, actorId: UserId | null = null): Promise<void> {
    await this.assertExists(name);
    await this.waha.deleteSession(name);
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
