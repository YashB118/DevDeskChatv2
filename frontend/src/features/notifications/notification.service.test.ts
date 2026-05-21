import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus } from '@/realtime/eventBus';
import { shouldNotify, createNotificationService, type NotificationGates } from './notification.service';
import type { MessageNewPayload } from '@/realtime/events.contract';

function payload(over: Partial<MessageNewPayload> = {}): MessageNewPayload {
  return {
    chatId: 'c-1',
    message: { id: 'm-1', chatId: 'c-1', senderId: 'u-other', body: 'hi', ts: 1, type: 'TEXT' },
    preview: { messageId: 'm-1', preview: 'hi', ts: 1, fromSelf: false },
    ...over,
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

  it('fromSelf suppresses everything', () => {
    const p = payload({ preview: { messageId: 'm', preview: 'x', ts: 1, fromSelf: true } });
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
