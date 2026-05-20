import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagesService } from './messages.service';
import { type MessageRepository } from './message.repository';
import { type PendingMessageStore } from './pending.store';
import { type WahaService } from '@app/integrations/waha/waha.service';
import { type WahaStoreService } from '@app/integrations/waha-store/waha-store.service';
import { type SocketEmitter } from '@app/realtime/socket.emitter';
import { type TransactionRunner } from '@app/infra/db/transactions';
import { type MessageDomain } from './message.types';
import { MessageId } from '@app/shared/types/ids';

function buildMessage(overrides: Partial<MessageDomain> = {}): MessageDomain {
  return {
    id: MessageId('00000000-0000-4000-8000-000000000001'),
    chatId: 'c1',
    stanzaId: 'stanza-1',
    sessionId: null,
    fromJid: '1@lid',
    fromMe: false,
    body: 'hi',
    type: 'TEXT',
    rowId: null,
    sentAt: new Date('2026-05-20T00:00:00Z'),
    createdAt: new Date(),
    ...overrides,
  };
}

interface Stubs {
  repo: MessageRepository;
  waha: WahaService;
  store: WahaStoreService;
  pending: PendingMessageStore;
  emitter: SocketEmitter;
  tx: TransactionRunner;
}

function buildStubs(): Stubs {
  return {
    repo: {
      upsert: vi.fn(),
      findByStanzaId: vi.fn(),
    } as unknown as MessageRepository,
    waha: {} as unknown as WahaService,
    store: {} as unknown as WahaStoreService,
    pending: {
      add: vi.fn(),
      isPending: vi.fn(),
      resolve: vi.fn(),
    } as unknown as PendingMessageStore,
    emitter: { toChat: vi.fn() } as unknown as SocketEmitter,
    tx: { run: vi.fn(async (fn) => fn({})) } as unknown as TransactionRunner,
  };
}

describe('MessagesService.upsertFromWebhook (reconciliation)', () => {
  let stubs: Stubs;
  let svc: MessagesService;

  beforeEach(() => {
    stubs = buildStubs();
    svc = new MessagesService(
      stubs.repo,
      stubs.waha,
      stubs.store,
      stubs.pending,
      stubs.emitter,
      stubs.tx,
    );
  });

  it('does NOT emit message:new when the stanza was locally pending', async () => {
    vi.mocked(stubs.pending.isPending).mockResolvedValue(true);
    vi.mocked(stubs.repo.upsert).mockResolvedValue(buildMessage({ stanzaId: 's' }));
    const result = await svc.upsertFromWebhook({
      chatId: 'c1',
      stanzaId: 's',
      fromJid: 'me@lid',
      fromMe: true,
      body: 'hi',
      type: 'TEXT',
      sentAt: new Date(),
    });
    expect(result.wasPending).toBe(true);
    expect(stubs.pending.resolve).toHaveBeenCalledWith('s');
    expect(stubs.emitter.toChat).not.toHaveBeenCalled();
  });

  it('emits message:new for inbound messages that have no local shadow', async () => {
    vi.mocked(stubs.pending.isPending).mockResolvedValue(false);
    const message = buildMessage({ stanzaId: 'inbound-1' });
    vi.mocked(stubs.repo.upsert).mockResolvedValue(message);
    const result = await svc.upsertFromWebhook({
      chatId: 'c1',
      stanzaId: 'inbound-1',
      fromJid: 'them@lid',
      fromMe: false,
      body: 'hello',
      type: 'TEXT',
      sentAt: new Date(),
    });
    expect(result.wasPending).toBe(false);
    expect(stubs.pending.resolve).not.toHaveBeenCalled();
    expect(stubs.emitter.toChat).toHaveBeenCalledWith(
      'c1',
      'message:new',
      expect.objectContaining({ chatId: 'c1' }),
    );
  });
});
