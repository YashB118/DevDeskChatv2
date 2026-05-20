import { create } from 'zustand';
import type { ChatId, MessageId } from '@/shared/types/ids';
import { readLocal, writeLocal } from '@/lib/storage/localStorage';
import { z } from 'zod';

const DRAFTS_KEY = 'messages:drafts';
const DraftsSchema = z.record(z.string());

interface MessagesUIState {
  drafts: Record<string, string>;
  replyTarget: Record<string, MessageId | null>;
  editTarget: Record<string, MessageId | null>;
  search: Record<string, string>;

  setDraft: (chatId: ChatId, body: string) => void;
  clearDraft: (chatId: ChatId) => void;
  setReplyTarget: (chatId: ChatId, messageId: MessageId | null) => void;
  setEditTarget: (chatId: ChatId, messageId: MessageId | null) => void;
  setSearch: (chatId: ChatId, q: string) => void;
}

function loadDrafts(): Record<string, string> {
  return readLocal(DRAFTS_KEY, DraftsSchema) ?? {};
}

export const useMessagesUIStore = create<MessagesUIState>((set) => ({
  drafts: loadDrafts(),
  replyTarget: {},
  editTarget: {},
  search: {},

  setDraft: (chatId, body) => {
    set((prev) => {
      const next = { ...prev.drafts, [chatId]: body };
      writeLocal(DRAFTS_KEY, next);
      return { drafts: next };
    });
  },
  clearDraft: (chatId) => {
    set((prev) => {
      const { [chatId]: _removed, ...rest } = prev.drafts;
      writeLocal(DRAFTS_KEY, rest);
      return { drafts: rest };
    });
  },
  setReplyTarget: (chatId, messageId) => {
    set((prev) => ({ replyTarget: { ...prev.replyTarget, [chatId]: messageId } }));
  },
  setEditTarget: (chatId, messageId) => {
    set((prev) => ({ editTarget: { ...prev.editTarget, [chatId]: messageId } }));
  },
  setSearch: (chatId, q) => {
    set((prev) => ({ search: { ...prev.search, [chatId]: q } }));
  },
}));
