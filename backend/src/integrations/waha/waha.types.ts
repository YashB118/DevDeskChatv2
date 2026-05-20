import { z } from 'zod';

export const SessionStatusSchema = z.enum([
  'STARTING',
  'SCAN_QR_CODE',
  'WORKING',
  'STOPPED',
  'FAILED',
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  name: z.string().min(1),
  status: SessionStatusSchema,
  config: z.record(z.unknown()).optional(),
});
export type WahaSession = z.infer<typeof SessionSchema>;

export const ChatSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().optional(),
  isGroup: z.boolean().optional(),
  unreadCount: z.number().int().nonnegative().optional(),
  lastMessage: z
    .object({
      id: z.string(),
      body: z.string().optional(),
      timestamp: z.number().optional(),
      fromMe: z.boolean().optional(),
    })
    .partial()
    .nullable()
    .optional(),
});
export type WahaChat = z.infer<typeof ChatSchema>;

export const MessageSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1),
  from: z.string().min(1).optional(),
  fromMe: z.boolean().optional(),
  body: z.string().optional(),
  type: z.string().optional(),
  timestamp: z.number().optional(),
  hasMedia: z.boolean().optional(),
  quotedMsgId: z.string().optional(),
});
export type WahaMessage = z.infer<typeof MessageSchema>;

export const QrCodeSchema = z.object({
  mimetype: z.string().min(1),
  data: z.string().min(1),
});
export type WahaQrCode = z.infer<typeof QrCodeSchema>;

export interface ListChatsParams {
  limit?: number;
  offset?: number;
}

export interface ListMessagesParams {
  limit?: number;
  offset?: number;
  downloadMedia?: boolean;
}

export interface SendTextParams {
  session: string;
  chatId: string;
  text: string;
  quotedMessageId?: string;
  mentions?: string[];
}

export interface SendMediaParams {
  session: string;
  chatId: string;
  file: { url?: string; data?: string; mimetype: string; filename?: string };
  caption?: string;
  asDocument?: boolean;
}

export interface EditMessageParams {
  session: string;
  chatId: string;
  messageId: string;
  text: string;
}

export interface DeleteMessageParams {
  session: string;
  chatId: string;
  messageId: string;
}

export interface ReactToMessageParams {
  session: string;
  chatId: string;
  messageId: string;
  reaction: string;
}

export interface ForwardMessageParams {
  session: string;
  fromChatId: string;
  toChatId: string;
  messageId: string;
}
