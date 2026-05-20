import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import { useCurrentUserId } from '@/shared/state/currentUser';
import type { ChatId, MessageId } from '@/shared/types/ids';
import { messagesApi } from '../api/messages.api';
import {
  appendOptimistic,
  applyDelete,
  applyEdit,
  applyReaction,
  buildPending,
  makeTempId,
  markFailed,
  reconcileSend,
  type MessagesCache,
} from '../optimistic';
import type { SendMessageInput } from '../types';

export interface UseSendMessageReturn {
  send: (input: SendMessageInput) => Promise<void>;
  isSending: boolean;
}

export function useSendMessage(chatId: ChatId): UseSendMessageReturn {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const mutation = useMutation({
    mutationFn: ({ input, tempId }: { input: SendMessageInput; tempId: string }) =>
      messagesApi.send(chatId, input, tempId),
    onMutate: ({ input, tempId }) => {
      if (!userId) return { tempId };
      const optimistic = buildPending(chatId, userId, input, tempId);
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        appendOptimistic(data, optimistic),
      );
      return { tempId };
    },
    onSuccess: (server, vars, _ctx) => {
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        reconcileSend(data, vars.tempId, server),
      );
    },
    onError: (_err, vars, _ctx) => {
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        markFailed(data, vars.tempId),
      );
    },
  });

  const send = useCallback(
    async (input: SendMessageInput) => {
      const tempId = makeTempId();
      await mutation.mutateAsync({ input, tempId });
    },
    [mutation],
  );

  return { send, isSending: mutation.isPending };
}

export function useEditMessage(chatId: ChatId): {
  edit: (messageId: MessageId, body: string) => Promise<void>;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: MessageId; body: string }) =>
      messagesApi.edit(chatId, messageId, body),
    onMutate: ({ messageId, body }) => {
      const prev = qc.getQueryData<MessagesCache>(keys.messages(chatId));
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        applyEdit(data, { messageId, body }),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(keys.messages(chatId), ctx.prev);
    },
  });

  return {
    edit: async (messageId, body) => {
      await mutation.mutateAsync({ messageId, body });
    },
  };
}

export function useDeleteMessage(chatId: ChatId): {
  remove: (messageId: MessageId) => Promise<void>;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (messageId: MessageId) => messagesApi.delete(chatId, messageId),
    onMutate: (messageId) => {
      const prev = qc.getQueryData<MessagesCache>(keys.messages(chatId));
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        applyDelete(data, { messageId }),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(keys.messages(chatId), ctx.prev);
    },
  });

  return {
    remove: async (messageId) => {
      await mutation.mutateAsync(messageId);
    },
  };
}

export function useReactToMessage(chatId: ChatId): {
  react: (messageId: MessageId, emoji: string | null) => Promise<void>;
} {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const mutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: MessageId; emoji: string | null }) =>
      messagesApi.react(chatId, messageId, emoji),
    onMutate: ({ messageId, emoji }) => {
      if (!userId) return { prev: undefined };
      const prev = qc.getQueryData<MessagesCache>(keys.messages(chatId));
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        applyReaction(data, { chatId, messageId, userId, emoji }),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(keys.messages(chatId), ctx.prev);
    },
  });

  return {
    react: async (messageId, emoji) => {
      await mutation.mutateAsync({ messageId, emoji });
    },
  };
}
