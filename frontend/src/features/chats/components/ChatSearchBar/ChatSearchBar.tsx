import type { ReactElement } from 'react';
import { Input } from '@/design-system/primitives/Input';
import { useChatsUIStore } from '../../store/chats.store';

export function ChatSearchBar(): ReactElement {
  const search = useChatsUIStore((s) => s.search);
  const setSearch = useChatsUIStore((s) => s.setSearch);

  return (
    <Input
      type="search"
      size="sm"
      aria-label="Search chats"
      placeholder="Search chats"
      value={search}
      onChange={(e) => {
        setSearch(e.target.value);
      }}
    />
  );
}
