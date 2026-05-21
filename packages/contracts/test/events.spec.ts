import { describe, expect, it } from 'vitest';
import {
  InboundEvents,
  OutboundEvents,
  PingSchema,
  MessageAckSchema,
  ChatAssignmentSchema,
  UserUpdatedSchema,
  FeedbackNewSchema,
} from '../src/events';

describe('contracts/events', () => {
  it('inbound map registers ping + chats:join + chats:leave', () => {
    expect(Object.keys(InboundEvents).sort()).toEqual(['chats:join', 'chats:leave', 'ping']);
  });

  it('outbound map covers every shipped event', () => {
    expect(Object.keys(OutboundEvents).sort()).toEqual(
      [
        'chat:assigned',
        'chat:muted',
        'chat:read',
        'chat:unassigned',
        'error:invalid_payload',
        'feedback:new',
        'group:participants',
        'message:ack',
        'message:deleted',
        'message:edited',
        'message:new',
        'message:reaction',
        'pong',
        'session:status',
        'user:updated',
      ].sort(),
    );
  });

  it('PingSchema accepts a valid payload', () => {
    expect(PingSchema.safeParse({ nonce: 'abc' }).success).toBe(true);
  });

  it('MessageAckSchema accepts FAILED state', () => {
    const r = MessageAckSchema.safeParse({ chatId: 'c', stanzaId: 's', ack: 'FAILED' });
    expect(r.success).toBe(true);
  });

  it('ChatAssignmentSchema requires UUIDs', () => {
    const r = ChatAssignmentSchema.safeParse({
      assignmentId: '00000000-0000-0000-0000-000000000000',
      userId: '00000000-0000-0000-0000-000000000000',
      chatId: 'c',
      assignedBy: null,
      assignedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('UserUpdatedSchema accepts partial updates', () => {
    expect(UserUpdatedSchema.safeParse({ id: 'u', disabled: true }).success).toBe(true);
    expect(UserUpdatedSchema.safeParse({ id: 'u', role: 'ADMIN' }).success).toBe(true);
  });

  it('FeedbackNewSchema requires id + numeric ts', () => {
    expect(FeedbackNewSchema.safeParse({ id: 'f', ts: 1700000000000 }).success).toBe(true);
    expect(FeedbackNewSchema.safeParse({ id: 'f' }).success).toBe(false);
  });
});
