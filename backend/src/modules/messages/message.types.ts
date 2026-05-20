import { type MessageId } from '@app/shared/types/ids';

export const MessageTypeValues = [
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'DOCUMENT',
  'STICKER',
  'LOCATION',
  'CONTACT',
  'SYSTEM',
  'REACTION',
  'UNKNOWN',
] as const;
export type MessageType = (typeof MessageTypeValues)[number];

export interface MessageDomain {
  id: MessageId;
  chatId: string;
  stanzaId: string;
  sessionId: string | null;
  fromJid: string;
  fromMe: boolean;
  body: string | null;
  type: MessageType;
  rowId: number | null;
  sentAt: Date;
  createdAt: Date;
}

export interface ReactionDomain {
  stanzaId: string;
  senderJid: string;
  emoji: string;
  createdAt: Date;
}

export interface MessageEditDomain {
  id: string;
  stanzaId: string;
  previousBody: string | null;
  newBody: string | null;
  editedAt: Date;
}

export interface QuoteDomain {
  stanzaId: string;
  quotedStanzaId: string;
  quotedBody: string | null;
}

export interface EnrichedMessage extends MessageDomain {
  reactions: ReactionDomain[];
  quote: QuoteDomain | null;
  mentions: string[];
  deleted: boolean;
  edits: MessageEditDomain[];
}
