import type { ReactElement } from 'react';
import { MessageComposer, MessageList, MessageSearch } from '@/features/messages';
import { useChatIdParam } from '../hooks/useChatIdParam';

export function ChatPage(): ReactElement {
  const chatId = useChatIdParam();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] p-3">
        <h2 className="text-[length:var(--text-md)] font-semibold">{chatId}</h2>
        <div className="ml-auto w-64">
          <MessageSearch chatId={chatId} />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <MessageList chatId={chatId} />
      </div>
      <MessageComposer chatId={chatId} />
    </div>
  );
}
