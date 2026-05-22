import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import { useCurrentUserId } from '@/shared/state/currentUser';
import type { ChatId } from '@/shared/types/ids';
import { useConnectivityStore } from '@/lib/offline/connectivity';
import { enqueueSend } from '@/lib/offline/sendQueue';
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

export function useSendMessage(chatId: ChatId, session: string): UseSendMessageReturn {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const mutation = useMutation({
    mutationFn: ({ input, tempId: _tempId }: { input: SendMessageInput; tempId: string }) =>
      messagesApi.send(chatId, session, input),
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
      if (!useConnectivityStore.getState().online) {
        if (userId) {
          const optimistic = buildPending(chatId, userId, input, tempId);
          qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
            appendOptimistic(data, optimistic),
          );
        }
        enqueueSend(async () => {
          const server = await messagesApi.send(chatId, session, input);
          qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
            reconcileSend(data, tempId, server),
          );
        });
        return;
      }
      await mutation.mutateAsync({ input, tempId });
    },
    [mutation, chatId, qc, userId, session],
  );

  return { send, isSending: mutation.isPending };
}

export function useEditMessage(chatId: ChatId, session: string): {
  edit: (stanzaId: string, body: string) => Promise<void>;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ stanzaId, body }: { stanzaId: string; body: string }) =>
      messagesApi.edit(chatId, stanzaId, session, body),
    onMutate: ({ stanzaId, body }) => {
      const prev = qc.getQueryData<MessagesCache>(keys.messages(chatId));
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        applyEdit(data, { messageId: stanzaId, body }),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(keys.messages(chatId), ctx.prev);
    },
  });

  return {
    edit: async (stanzaId, body) => {
      await mutation.mutateAsync({ stanzaId, body });
    },
  };
}

export function useDeleteMessage(chatId: ChatId, session: string): {
  remove: (stanzaId: string) => Promise<void>;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (stanzaId: string) => messagesApi.delete(chatId, stanzaId, session),
    onMutate: (stanzaId) => {
      const prev = qc.getQueryData<MessagesCache>(keys.messages(chatId));
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        applyDelete(data, { messageId: stanzaId }),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(keys.messages(chatId), ctx.prev);
    },
  });

  return {
    remove: async (stanzaId) => {
      await mutation.mutateAsync(stanzaId);
    },
  };
}

/**
 * Backend toggle: POST `/react` with `{session, emoji}` always; response
 * `{removed}` tells us which direction we landed. The optimistic step happens
 * after the round-trip — the toggle is too easy to mispredict from the cache.
 */
export function useReactToMessage(chatId: ChatId, session: string): {
  react: (stanzaId: string, emoji: string) => Promise<void>;
} {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const mutation = useMutation({
    mutationFn: ({ stanzaId, emoji }: { stanzaId: string; emoji: string }) =>
      messagesApi.react(chatId, stanzaId, session, emoji),
    onSuccess: (result, vars) => {
      if (!userId) return;
      qc.setQueryData<MessagesCache>(keys.messages(chatId), (data) =>
        applyReaction(data, {
          chatId,
          messageId: vars.stanzaId,
          userId,
          emoji: result.removed ? null : vars.emoji,
        }),
      );
    },
  });

  return {
    react: async (stanzaId, emoji) => {
      await mutation.mutateAsync({ stanzaId, emoji });
    },
  };
}
