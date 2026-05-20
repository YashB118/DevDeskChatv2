import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { toChatId } from '@/shared/types/ids';
import { useChatsUIStore } from '../store/chats.store';

/**
 * Mirror the URL `:chatId` param into `chatsUIStore.activeChatId`. Mount in
 * the dashboard layout so every chats route keeps the store in sync.
 */
export function useSyncActiveChatFromUrl(): void {
  const { chatId } = useParams<{ chatId: string }>();
  const setActiveChatId = useChatsUIStore((s) => s.setActiveChatId);

  useEffect(() => {
    setActiveChatId(chatId ? toChatId(chatId) : null);
  }, [chatId, setActiveChatId]);
}
