import { useState, type ReactElement, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/Dropdown';
import type { ChatId } from '@/shared/types/ids';
import { useChatActions } from '../../hooks/useChatActions';

interface ChatContextMenuProps {
  chatId: ChatId;
  muted: boolean;
  hasUnread: boolean;
  children: ReactNode;
}

export function ChatContextMenu({
  chatId,
  muted,
  hasUnread,
  children,
}: ChatContextMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const { markRead, setMuted } = useChatActions();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!hasUnread}
          onSelect={() => {
            void markRead(chatId);
          }}
        >
          Mark as read
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void setMuted(chatId, !muted);
          }}
        >
          {muted ? 'Unmute' : 'Mute'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
