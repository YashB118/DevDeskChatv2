import { Injectable } from '@nestjs/common';
import { ForbiddenError } from '@app/modules/auth/auth.errors';
import { NotFoundError } from '@app/shared/errors';
import { type UserDomain, UserRole } from '@app/modules/users/user.types';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { FeedbackRepository, type ListFeedbackOptions } from './feedback.repository';
import { type FeedbackDomain } from './feedback.types';
import { type ListFeedbackQuery, type SubmitFeedbackInput } from './feedback.schema';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly repo: FeedbackRepository,
    private readonly emitter: SocketEmitter,
  ) {}

  async submit(actor: UserDomain, input: SubmitFeedbackInput): Promise<FeedbackDomain> {
    const created = await this.repo.insert({ userId: actor.id, body: input.body });
    this.emitter.toAdmins('feedback:new', { id: created.id, ts: created.createdAt.getTime() });
    return created;
  }

  list(actor: UserDomain, query: ListFeedbackQuery): Promise<FeedbackDomain[]> {
    // Admin sees everyone's feedback; developers see only their own.
    const opts: ListFeedbackOptions = {};
    if (actor.role !== UserRole.ADMIN) opts.userId = actor.id;
    if (query.unreadOnly !== undefined) opts.unreadOnly = query.unreadOnly;
    if (query.limit !== undefined) opts.limit = query.limit;
    return this.repo.list(opts);
  }

  async markRead(actor: UserDomain, id: string): Promise<FeedbackDomain> {
    return this.setRead(actor, id, true);
  }

  async setRead(actor: UserDomain, id: string, read: boolean): Promise<FeedbackDomain> {
    const existing = await this.repo.findById(id);
    if (existing === null) throw new NotFoundError('feedback');
    // Only admins can flip the read state; the lifecycle exists for the inbox triage workflow.
    if (actor.role !== UserRole.ADMIN) throw new ForbiddenError('Admin role required');
    const updated = await this.repo.setRead(id, read);
    if (updated === null) throw new NotFoundError('feedback');
    return updated;
  }
}
