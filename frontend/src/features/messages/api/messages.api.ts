import { apiClient } from '@/lib/http/client';
import type { ChatId, MessageId } from '@/shared/types/ids';
import {
  MessageDTOSchema,
  MessagePageSchema,
  type MessageDTO,
  type MessagePage,
  type SendMessageInput,
} from '../types';

export const messagesApi = {
  async list(chatId: ChatId, cursor?: string | null, limit = 50): Promise<MessagePage> {
    const res = await apiClient.get<unknown>(`/api/messages/${chatId}`, {
      params: { limit, ...(cursor ? { cursor } : {}) },
    });
    return MessagePageSchema.parse(res.data);
  },

  async send(chatId: ChatId, input: SendMessageInput, tempId: string): Promise<MessageDTO> {
    const res = await apiClient.post<unknown>(`/api/messages/${chatId}/send`, { ...input, tempId });
    return MessageDTOSchema.parse(res.data);
  },

  async edit(chatId: ChatId, messageId: MessageId, body: string): Promise<MessageDTO> {
    const res = await apiClient.patch<unknown>(`/api/messages/${chatId}/${messageId}`, { body });
    return MessageDTOSchema.parse(res.data);
  },

  async delete(chatId: ChatId, messageId: MessageId): Promise<void> {
    await apiClient.delete(`/api/messages/${chatId}/${messageId}`);
  },

  async react(chatId: ChatId, messageId: MessageId, emoji: string | null): Promise<void> {
    if (emoji === null) {
      await apiClient.delete(`/api/messages/${chatId}/${messageId}/reaction`);
      return;
    }
    await apiClient.post(`/api/messages/${chatId}/${messageId}/reaction`, { emoji });
  },

  async forward(messageIds: readonly MessageId[], toChatIds: readonly ChatId[]): Promise<void> {
    await apiClient.post('/api/messages/forward', { messageIds, toChatIds });
  },

  async participants(chatId: ChatId): Promise<readonly { id: string; name: string }[]> {
    const res = await apiClient.get<unknown>(`/api/chats/${chatId}/participants`);
    // shallow validation — caller doesn't depend on richer shape yet
    const data = res.data as { items?: { id: string; name: string }[] };
    return data.items ?? [];
  },
};
