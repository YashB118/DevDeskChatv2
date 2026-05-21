import { useEffect, type ReactNode } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useSettingsStore } from '@/shared/state/settings';
import { showDesktopNotification, getNotificationPermission } from '@/lib/notifications/permission';
import { playNotificationSound } from '@/lib/notifications/sound';
import { setFaviconBadge } from '@/lib/notifications/favicon';
import { useChatsUIStore, type ChatDTO, type ChatListPage } from '@/features/chats';
import { useGlobalMute } from '@/features/mute';
import { createNotificationService } from '@/features/notifications';

type ChatsCache = InfiniteData<ChatListPage>;

function findChat(qc: ReturnType<typeof useQueryClient>, chatId: string): ChatDTO | null {
  const entries = qc.getQueriesData<ChatsCache>({ queryKey: ['chats'] });
  for (const [, data] of entries) {
    const found = data?.pages.flatMap((p) => p.items).find((c) => c.id === chatId);
    if (found) return found;
  }
  return null;
}

function totalUnread(qc: ReturnType<typeof useQueryClient>): number {
  const entries = qc.getQueriesData<ChatsCache>({ queryKey: ['chats'] });
  const first = entries[0]?.[1];
  if (!first) return 0;
  return first.pages.flatMap((p) => p.items).reduce((acc, c) => acc + c.unreadCount, 0);
}

export function NotificationController({ children }: { children?: ReactNode }): ReactNode {
  const qc = useQueryClient();
  const { data: globalMute } = useGlobalMute();

  useEffect(() => {
    const teardown = createNotificationService(
      {
        desktopEnabled: () => useSettingsStore.getState().settings.notifications.desktopEnabled,
        soundEnabled: () => useSettingsStore.getState().settings.notifications.soundEnabled,
        faviconBadgeEnabled: () =>
          useSettingsStore.getState().settings.notifications.faviconBadgeEnabled,
        globalMuted: () => globalMute?.enabled ?? false,
        chatMuted: (chatId) => findChat(qc, chatId)?.muted ?? false,
        activeChatId: () => useChatsUIStore.getState().activeChatId,
        documentHasFocus: () => (typeof document === 'undefined' ? false : document.hasFocus()),
        permissionGranted: () => getNotificationPermission() === 'granted',
      },
      {
        showDesktop: (payload) => {
          const chat = findChat(qc, payload.chatId);
          const title = chat?.title ?? 'New message';
          showDesktopNotification(title, payload.message.body ?? '');
        },
        playSound: () => {
          playNotificationSound();
        },
        bumpBadge: () => {
          setFaviconBadge(totalUnread(qc));
        },
      },
    );
    return teardown;
  }, [qc, globalMute?.enabled]);

  // Keep favicon badge in sync with any chat-cache changes (read/mute/etc).
  useEffect(() => {
    const enabled = (): boolean =>
      useSettingsStore.getState().settings.notifications.faviconBadgeEnabled;
    const unsub = qc.getQueryCache().subscribe(() => {
      if (enabled()) setFaviconBadge(totalUnread(qc));
    });
    return unsub;
  }, [qc]);

  return children ?? null;
}
