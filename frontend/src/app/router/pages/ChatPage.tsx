import type { ReactElement } from 'react';
import { useChatIdParam } from '../hooks/useChatIdParam';

export function ChatPage(): ReactElement {
  const chatId = useChatIdParam();
  return (
    <div className="flex h-full flex-col p-6">
      <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">Chat</p>
      <h2 className="text-[length:var(--text-xl)] font-semibold">{chatId}</h2>
      <p className="mt-4 text-[var(--color-fg-secondary)]">
        Message view ships in Phase 8.
      </p>
    </div>
  );
}
