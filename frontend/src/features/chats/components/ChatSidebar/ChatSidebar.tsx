import type { ReactElement } from 'react';
import { ChatList } from '../ChatList/ChatList';
import { ChatFilters } from '../ChatFilters/ChatFilters';
import { ChatSearchBar } from '../ChatSearchBar/ChatSearchBar';
import { SessionSwitcher } from '../SessionSwitcher/SessionSwitcher';

export function ChatSidebar(): ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <SessionSwitcher />
        <ChatSearchBar />
        <ChatFilters />
      </div>
      <div className="-mx-3 min-h-0 flex-1 border-t border-[var(--color-border-subtle)]">
        <ChatList />
      </div>
    </div>
  );
}
