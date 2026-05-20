import { useParams } from 'react-router-dom';
import { toChatId, type ChatId } from '@/shared/types/ids';

export function useChatIdParam(): ChatId {
  const { chatId } = useParams<{ chatId: string }>();
  if (!chatId) {
    throw new Error('useChatIdParam called outside a :chatId route');
  }
  return toChatId(chatId);
}
