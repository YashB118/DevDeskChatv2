import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus } from '@/realtime/eventBus';
import { shouldNotify, createNotificationService, type NotificationGates } from './notification.service';
import type { MessageNewPayload } from '@/realtime/events.contract';

function makeMessage(
  over: Partial<MessageNewPayload['message']> = {},
): MessageNewPayload['message'] {
  return {
    id: 'm-1',
    chatId: 'c-1',
    stanzaId: 'stz-1',
    fromJid: 'u-other',
    fromMe: false,
    body: 'hi',
    type: 'TEXT',
    sentAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function payload(
  over: { chatId?: string; message?: Partial<MessageNewPayload['message']> } = {},
): MessageNewPayload {
  return {
    chatId: over.chatId ?? 'c-1',
    message: makeMessage(over.message),
  };
}

function baseGates(over: Partial<NotificationGates> = {}): NotificationGates {
  return {
    desktopEnabled: () => true,
    soundEnabled: () => true,
    faviconBadgeEnabled: () => true,
    globalMuted: () => false,
    chatMuted: () => false,
    activeChatId: () => null,
    documentHasFocus: () => false,
    permissionGranted: () => true,
    ...over,
  };
}

describe('shouldNotify', () => {
  it('all-on path enables every output', () => {
    expect(shouldNotify(payload(), baseGates())).toEqual({
      desktop: true,
      sound: true,
      badge: true,
    });
  });

  it('fromMe suppresses everything', () => {
    const p = payload({ message: { fromMe: true } });
    expect(shouldNotify(p, baseGates())).toEqual({ desktop: false, sound: false, badge: false });
  });

  it('global mute suppresses everything', () => {
    expect(shouldNotify(payload(), baseGates({ globalMuted: () => true }))).toEqual({
      desktop: false,
      sound: false,
      badge: false,
    });
  });

  it('per-chat mute suppresses everything', () => {
    expect(
      shouldNotify(payload(), baseGates({ chatMuted: (id) => id === 'c-1' })),
    ).toEqual({ desktop: false, sound: false, badge: false });
  });

  it('active + focused chat suppresses everything', () => {
    expect(
      shouldNotify(
        payload(),
        baseGates({ activeChatId: () => 'c-1', documentHasFocus: () => true }),
      ),
    ).toEqual({ desktop: false, sound: false, badge: false });
  });

  it('active but UNfocused chat still notifies', () => {
    const result = shouldNotify(
      payload(),
      baseGates({ activeChatId: () => 'c-1', documentHasFocus: () => false }),
    );
    expect(result.badge).toBe(true);
    expect(result.sound).toBe(true);
  });

  it('desktop opt-out keeps sound + badge', () => {
    expect(shouldNotify(payload(), baseGates({ desktopEnabled: () => false }))).toEqual({
      desktop: false,
      sound: true,
      badge: true,
    });
  });

  it('permission denied blocks desktop only', () => {
    expect(
      shouldNotify(payload(), baseGates({ permissionGranted: () => false })),
    ).toEqual({ desktop: false, sound: true, badge: true });
  });
});

describe('createNotificationService', () => {
  beforeEach(() => {
    eventBus.all.clear();
  });

  it('wires message:received to outputs and respects teardown', () => {
    const outputs = {
      showDesktop: vi.fn(),
      playSound: vi.fn(),
      bumpBadge: vi.fn(),
    };
    const teardown = createNotificationService(baseGates(), outputs);

    eventBus.emit('message:received', payload());
    expect(outputs.showDesktop).toHaveBeenCalledTimes(1);
    expect(outputs.playSound).toHaveBeenCalledTimes(1);
    expect(outputs.bumpBadge).toHaveBeenCalledTimes(1);

    teardown();
    eventBus.emit('message:received', payload({ chatId: 'c-2' }));
    expect(outputs.showDesktop).toHaveBeenCalledTimes(1);
  });
});
