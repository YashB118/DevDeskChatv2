import { create } from 'zustand';
import type { ChatId } from '@/shared/types/ids';
import { readLocal, writeLocal } from '@/lib/storage/localStorage';
import { ChatFiltersSchema, DEFAULT_FILTERS, type ChatFilters } from '../types';

const FILTERS_KEY = 'chats:filters';

function loadFilters(): ChatFilters {
  return readLocal(FILTERS_KEY, ChatFiltersSchema) ?? DEFAULT_FILTERS;
}

interface ChatsUIState {
  activeChatId: ChatId | null;
  filters: ChatFilters;
  search: string;
  selectedChatIds: ReadonlySet<ChatId>;
  setActiveChatId: (id: ChatId | null) => void;
  setFilters: (patch: Partial<ChatFilters>) => void;
  resetFilters: () => void;
  setSearch: (q: string) => void;
  toggleSelection: (id: ChatId) => void;
  clearSelection: () => void;
}

export const useChatsUIStore = create<ChatsUIState>((set) => ({
  activeChatId: null,
  filters: loadFilters(),
  search: '',
  selectedChatIds: new Set(),
  setActiveChatId: (id) => {
    set({ activeChatId: id });
  },
  setFilters: (patch) => {
    set((prev) => {
      const next = { ...prev.filters, ...patch };
      writeLocal(FILTERS_KEY, next);
      return { filters: next };
    });
  },
  resetFilters: () => {
    writeLocal(FILTERS_KEY, DEFAULT_FILTERS);
    set({ filters: DEFAULT_FILTERS });
  },
  setSearch: (q) => {
    set({ search: q });
  },
  toggleSelection: (id) => {
    set((prev) => {
      const next = new Set(prev.selectedChatIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedChatIds: next };
    });
  },
  clearSelection: () => {
    set({ selectedChatIds: new Set() });
  },
}));
