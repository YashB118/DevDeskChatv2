import { type UserId, type ChatId } from '@app/shared/types/ids';

export const roomFor = {
  user: (id: UserId | string): string => `user:${id.toString()}`,
  chat: (id: ChatId | string): string => `chat:${id.toString()}`,
  admin: (): string => 'admin',
} as const;
