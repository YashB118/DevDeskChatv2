import type { MessageNewPayload } from '@/realtime/events.contract';
import { eventBus } from '@/realtime/eventBus';

export interface NotificationGates {
  desktopEnabled: () => boolean;
  soundEnabled: () => boolean;
  faviconBadgeEnabled: () => boolean;
  globalMuted: () => boolean;
  chatMuted: (chatId: string) => boolean;
  activeChatId: () => string | null;
  documentHasFocus: () => boolean;
  permissionGranted: () => boolean;
}

export interface NotificationOutputs {
  showDesktop: (payload: MessageNewPayload) => void;
  playSound: () => void;
  bumpBadge: () => void;
}

/**
 * Pure gating logic — exported separately so tests can drive every branch
 * without touching the Notification API or canvas.
 */
export function shouldNotify(
  payload: MessageNewPayload,
  gates: NotificationGates,
): { desktop: boolean; sound: boolean; badge: boolean } {
  if (payload.message.fromMe) return { desktop: false, sound: false, badge: false };
  if (gates.globalMuted()) return { desktop: false, sound: false, badge: false };
  if (gates.chatMuted(payload.chatId)) return { desktop: false, sound: false, badge: false };

  const isActiveAndFocused =
    gates.activeChatId() === payload.chatId && gates.documentHasFocus();

  if (isActiveAndFocused) {
    return { desktop: false, sound: false, badge: false };
  }

  return {
    desktop: gates.desktopEnabled() && gates.permissionGranted(),
    sound: gates.soundEnabled(),
    badge: gates.faviconBadgeEnabled(),
  };
}

/**
 * Wires the event bus to outputs. Returns a teardown.
 */
export function createNotificationService(
  gates: NotificationGates,
  outputs: NotificationOutputs,
): () => void {
  const handler = (payload: MessageNewPayload): void => {
    const decision = shouldNotify(payload, gates);
    if (decision.desktop) outputs.showDesktop(payload);
    if (decision.sound) outputs.playSound();
    if (decision.badge) outputs.bumpBadge();
  };
  eventBus.on('message:received', handler);
  return () => {
    eventBus.off('message:received', handler);
  };
}
