declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type ChatId = Brand<string, 'ChatId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type SessionId = Brand<string, 'SessionId'>;

export const UserId = (id: string): UserId => id as UserId;
export const ChatId = (id: string): ChatId => id as ChatId;
export const MessageId = (id: string): MessageId => id as MessageId;
export const SessionId = (id: string): SessionId => id as SessionId;
