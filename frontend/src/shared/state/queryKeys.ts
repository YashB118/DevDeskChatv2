import type { ChatId, MessageId, SessionId, UserId } from '@/shared/types/ids';

/**
 * Central TanStack Query keys factory. All keys are `as const` tuples so the
 * types flow through `useQuery`/`useMutation` without manual annotation.
 *
 * Feature phases append their slices here — never inline keys in components.
 */
export const keys = {
  me: () => ['me'] as const,

  chats: (filters?: Readonly<Record<string, unknown>>) =>
    ['chats', filters ?? {}] as const,
  chat: (chatId: ChatId) => ['chats', 'detail', chatId] as const,

  messages: (chatId: ChatId) => ['messages', chatId] as const,
  message: (chatId: ChatId, messageId: MessageId) =>
    ['messages', chatId, messageId] as const,
  chatParticipants: (chatId: ChatId | string) =>
    ['chats', 'participants', chatId] as const,

  assignments: () => ['assignments'] as const,
  assignmentsByUser: (userId: UserId) => ['assignments', 'user', userId] as const,

  sessions: () => ['sessions'] as const,
  session: (sessionId: SessionId) => ['sessions', sessionId] as const,

  users: () => ['users'] as const,
  user: (userId: UserId) => ['users', userId] as const,

  feedback: () => ['feedback'] as const,
} as const;

export type QueryKey =
  | ReturnType<typeof keys.me>
  | ReturnType<typeof keys.chats>
  | ReturnType<typeof keys.chat>
  | ReturnType<typeof keys.messages>
  | ReturnType<typeof keys.message>
  | ReturnType<typeof keys.chatParticipants>
  | ReturnType<typeof keys.assignments>
  | ReturnType<typeof keys.assignmentsByUser>
  | ReturnType<typeof keys.sessions>
  | ReturnType<typeof keys.session>
  | ReturnType<typeof keys.users>
  | ReturnType<typeof keys.user>
  | ReturnType<typeof keys.feedback>;
