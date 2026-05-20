import { Injectable } from '@nestjs/common';
import { ForbiddenError } from '@app/modules/auth/auth.errors';
import { NotFoundError } from '@app/shared/errors';
import { type UserDomain, UserRole } from '@app/modules/users/user.types';
import { FeedbackRepository, type ListFeedbackOptions } from './feedback.repository';
import { type FeedbackDomain } from './feedback.types';
import { type ListFeedbackQuery, type SubmitFeedbackInput } from './feedback.schema';

@Injectable()
export class FeedbackService {
  constructor(private readonly repo: FeedbackRepository) {}

  submit(actor: UserDomain, input: SubmitFeedbackInput): Promise<FeedbackDomain> {
    return this.repo.insert({ userId: actor.id, body: input.body });
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
    const existing = await this.repo.findById(id);
    if (existing === null) throw new NotFoundError('feedback');
    // Only admins can mark feedback as read; the lifecycle exists for the
    // inbox triage workflow.
    if (actor.role !== UserRole.ADMIN) throw new ForbiddenError('Admin role required');
    const updated = await this.repo.markRead(id);
    if (updated === null) throw new NotFoundError('feedback');
    return updated;
  }
}
