import { describe, it, expect, beforeEach } from 'vitest';
import { useChatsUIStore } from './chats.store';
import { DEFAULT_FILTERS } from '../types';
import { toChatId } from '@/shared/types/ids';

beforeEach(() => {
  window.localStorage.clear();
  useChatsUIStore.setState({
    activeChatId: null,
    filters: DEFAULT_FILTERS,
    search: '',
    selectedChatIds: new Set(),
  });
});

describe('useChatsUIStore', () => {
  it('persists filter changes to localStorage', () => {
    useChatsUIStore.getState().setFilters({ unreadOnly: true });
    expect(useChatsUIStore.getState().filters.unreadOnly).toBe(true);
    const raw = window.localStorage.getItem('chats:filters');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}') as { unreadOnly: boolean };
    expect(parsed.unreadOnly).toBe(true);
  });

  it('resetFilters restores defaults and clears persisted value', () => {
    useChatsUIStore.getState().setFilters({ hideMuted: true });
    useChatsUIStore.getState().resetFilters();
    expect(useChatsUIStore.getState().filters).toEqual(DEFAULT_FILTERS);
  });

  it('toggleSelection adds/removes branded ids', () => {
    const id = toChatId('c-1');
    useChatsUIStore.getState().toggleSelection(id);
    expect(useChatsUIStore.getState().selectedChatIds.has(id)).toBe(true);
    useChatsUIStore.getState().toggleSelection(id);
    expect(useChatsUIStore.getState().selectedChatIds.has(id)).toBe(false);
  });

  it('setActiveChatId tracks the URL-driven active chat', () => {
    const id = toChatId('c-42');
    useChatsUIStore.getState().setActiveChatId(id);
    expect(useChatsUIStore.getState().activeChatId).toBe(id);
    useChatsUIStore.getState().setActiveChatId(null);
    expect(useChatsUIStore.getState().activeChatId).toBeNull();
  });
});
