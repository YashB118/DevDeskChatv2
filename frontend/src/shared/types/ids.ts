type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type ChatId = Brand<string, 'ChatId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type SessionId = Brand<string, 'SessionId'>;

const idPattern = /^[\w@.:+-]+$/;

function assertId(value: string, label: string): void {
  if (!idPattern.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

export const toUserId = (s: string): UserId => {
  assertId(s, 'UserId');
  return s as UserId;
};

export const toChatId = (s: string): ChatId => {
  assertId(s, 'ChatId');
  return s as ChatId;
};

export const toMessageId = (s: string): MessageId => {
  assertId(s, 'MessageId');
  return s as MessageId;
};

export const toSessionId = (s: string): SessionId => {
  assertId(s, 'SessionId');
  return s as SessionId;
};
