import { describe, expect, it, vi } from 'vitest';
import { WebhookDispatch } from './dispatch';
import { type WebhookHandler } from './handler.types';
import { type NormalizedWebhookEvent } from './webhook.schema';

function fakeHandler(): WebhookHandler & { calls: NormalizedWebhookEvent[] } {
  const calls: NormalizedWebhookEvent[] = [];
  return {
    calls,
    handle(event: NormalizedWebhookEvent): Promise<void> {
      calls.push(event);
      return Promise.resolve();
    },
  };
}

function build(): {
  dispatch: WebhookDispatch;
  message: ReturnType<typeof fakeHandler>;
  ack: ReturnType<typeof fakeHandler>;
  edited: ReturnType<typeof fakeHandler>;
  reaction: ReturnType<typeof fakeHandler>;
  revoked: ReturnType<typeof fakeHandler>;
  session: ReturnType<typeof fakeHandler>;
  group: ReturnType<typeof fakeHandler>;
} {
  const message = fakeHandler();
  const ack = fakeHandler();
  const edited = fakeHandler();
  const reaction = fakeHandler();
  const revoked = fakeHandler();
  const session = fakeHandler();
  const group = fakeHandler();
  const dispatch = new WebhookDispatch(message, ack, edited, reaction, revoked, session, group);
  return { dispatch, message, ack, edited, reaction, revoked, session, group };
}

function evt(event: string): NormalizedWebhookEvent {
  return { id: 'e1', event, session: 's1', timestamp: 1, payload: {} };
}

describe('WebhookDispatch', () => {
  it('routes message and message.any to the message handler', async () => {
    const { dispatch, message } = build();
    await dispatch.dispatch(evt('message'));
    await dispatch.dispatch(evt('message.any'));
    expect(message.calls).toHaveLength(2);
  });

  it('routes message.ack to the ack handler', async () => {
    const { dispatch, ack } = build();
    await dispatch.dispatch(evt('message.ack'));
    expect(ack.calls).toHaveLength(1);
  });

  it('routes session.status and group.v2.participants to their handlers', async () => {
    const { dispatch, session, group } = build();
    await dispatch.dispatch(evt('session.status'));
    await dispatch.dispatch(evt('group.v2.participants'));
    expect(session.calls).toHaveLength(1);
    expect(group.calls).toHaveLength(1);
  });

  it('ack-only logs unknown event types (no handler invoked, no throw)', async () => {
    const { dispatch, message, ack } = build();
    await expect(dispatch.dispatch(evt('presence.update'))).resolves.toBeUndefined();
    expect(message.calls).toHaveLength(0);
    expect(ack.calls).toHaveLength(0);
  });

  it('propagates handler failure so BullMQ retries', async () => {
    const message = {
      handle: vi.fn(async (): Promise<void> => {
        throw new Error('boom');
      }),
    };
    const ack = fakeHandler();
    const edited = fakeHandler();
    const reaction = fakeHandler();
    const revoked = fakeHandler();
    const session = fakeHandler();
    const group = fakeHandler();
    const dispatch = new WebhookDispatch(message, ack, edited, reaction, revoked, session, group);
    await expect(dispatch.dispatch(evt('message'))).rejects.toThrow('boom');
  });
});
