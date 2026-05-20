import type { ReactElement } from 'react';
import { Input } from '@/design-system/primitives/Input';
import type { ChatId } from '@/shared/types/ids';
import { useMessagesUIStore } from '../../store/messages.store';

interface MessageSearchProps {
  chatId: ChatId;
}

export function MessageSearch({ chatId }: MessageSearchProps): ReactElement {
  const search = useMessagesUIStore((s) => s.search[chatId] ?? '');
  const setSearch = useMessagesUIStore((s) => s.setSearch);

  return (
    <Input
      type="search"
      size="sm"
      aria-label="Search in chat"
      placeholder="Search in chat"
      value={search}
      onChange={(e) => {
        setSearch(chatId, e.target.value);
      }}
    />
  );
}
