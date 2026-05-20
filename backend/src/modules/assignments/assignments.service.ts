import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '@app/infra/db/transactions';
import { UserId } from '@app/shared/types/ids';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { AuthRepository } from '@app/modules/auth/auth.repository';
import { UserRepository } from '@app/modules/users/user.repository';
import { UserNotFoundError } from '@app/modules/users/users.errors';
import { AssignmentRepository } from './assignment.repository';
import { AssignmentEvent } from './assignment-history.entity';
import { type AssignmentDomain, type AssignmentHistoryDomain } from './assignment.types';
import { type CreateAssignmentInput, type ListAssignmentsQuery } from './assignment.schema';
import { AssignmentAlreadyExistsError, AssignmentNotFoundError } from './assignments.errors';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly users: UserRepository,
    private readonly auth: AuthRepository,
    private readonly emitter: SocketEmitter,
    private readonly tx: TransactionRunner,
  ) {}

  list(query: ListAssignmentsQuery): Promise<AssignmentDomain[]> {
    const opts: { userId?: string; chatId?: string; activeOnly?: boolean; limit?: number } = {};
    if (query.userId !== undefined) opts.userId = query.userId;
    if (query.chatId !== undefined) opts.chatId = query.chatId;
    if (query.activeOnly !== undefined) opts.activeOnly = query.activeOnly;
    if (query.limit !== undefined) opts.limit = query.limit;
    return this.assignments.listAll(opts);
  }

  listActiveChatIdsForUser(userId: string): Promise<string[]> {
    return this.assignments.listActiveChatIdsForUser(userId);
  }

  listHistory(assignmentId: string): Promise<AssignmentHistoryDomain[]> {
    return this.assignments.listHistoryFor(assignmentId);
  }

  async create(input: CreateAssignmentInput, actorId: UserId | null): Promise<AssignmentDomain> {
    const target = await this.users.findById(UserId(input.userId));
    if (target === null) throw new UserNotFoundError(input.userId);

    return this.tx.run(async (em) => {
      const existing = await this.assignments.findActive(input.userId, input.chatId, em);
      if (existing !== null) throw new AssignmentAlreadyExistsError(input.userId, input.chatId);
      const created = await this.assignments.insert(
        {
          userId: input.userId,
          chatId: input.chatId,
          wahaSessionId: input.wahaSessionId ?? null,
          assignedBy: actorId,
        },
        em,
      );
      await this.assignments.writeHistory(
        {
          assignmentId: created.id,
          event: AssignmentEvent.ASSIGNED,
          actorId,
          payload: { chatId: input.chatId, userId: input.userId },
        },
        em,
      );
      await this.auth.writeAudit(
        'assignment.create',
        actorId,
        { assignmentId: created.id, chatId: input.chatId, userId: input.userId },
        em,
      );

      // Emit outside the DB calls but still in-transaction is fine —
      // socket dispatch is fire-and-forget at the io level; the typed
      // event itself was captured by the history row above.
      const payload = {
        assignmentId: created.id,
        userId: created.userId,
        chatId: created.chatId,
        assignedBy: created.assignedBy,
        assignedAt: created.assignedAt.toISOString(),
      };
      this.emitter.toUser(created.userId, 'chat:assigned', payload);
      this.emitter.toAdmins('chat:assigned', payload);
      return created;
    });
  }

  async remove(id: string, actorId: UserId | null): Promise<AssignmentDomain> {
    const existing = await this.assignments.findById(id);
    if (!existing?.isActive) throw new AssignmentNotFoundError(id);

    return this.tx.run(async (em) => {
      const updated = await this.assignments.deactivate(id, em);
      if (updated === null) throw new AssignmentNotFoundError(id);
      await this.assignments.writeHistory(
        {
          assignmentId: id,
          event: AssignmentEvent.UNASSIGNED,
          actorId,
          payload: { chatId: existing.chatId, userId: existing.userId },
        },
        em,
      );
      await this.auth.writeAudit(
        'assignment.remove',
        actorId,
        { assignmentId: id, chatId: existing.chatId, userId: existing.userId },
        em,
      );

      const payload = {
        assignmentId: updated.id,
        userId: updated.userId,
        chatId: updated.chatId,
        unassignedBy: actorId,
        unassignedAt: (updated.unassignedAt ?? new Date()).toISOString(),
      };
      this.emitter.toUser(updated.userId, 'chat:unassigned', payload);
      this.emitter.toAdmins('chat:unassigned', payload);
      return updated;
    });
  }
}
