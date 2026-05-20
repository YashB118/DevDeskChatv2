import { memo, type ReactElement } from 'react';
import { NavLink } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/design-system/primitives/Avatar';
import { Badge } from '@/design-system/primitives/Badge';
import { IconButton } from '@/design-system/compounds/IconButton';
import { MoreHorizontal, BellOff } from '@/design-system/icons';
import { toChatId } from '@/shared/types/ids';
import type { ChatDTO } from '../../types';
import { ChatContextMenu } from '../ChatContextMenu/ChatContextMenu';

interface ChatListItemProps {
  chat: ChatDTO;
  isActive: boolean;
}

function ChatListItemImpl({ chat, isActive }: ChatListItemProps): ReactElement {
  const chatId = toChatId(chat.id);
  const initials = chat.title
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <NavLink
      to={`/dashboard/${chat.id}`}
      viewTransition
      data-active={isActive || undefined}
      aria-current={isActive ? 'page' : undefined}
      className="group flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 hover:bg-[var(--color-bg-sunken)] data-[active]:bg-[var(--color-bg-sunken)]"
    >
      <Avatar size="md" className="shrink-0">
        {chat.avatarUrl ? <AvatarImage src={chat.avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials || '?'}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[length:var(--text-sm)] font-medium">{chat.title}</span>
          {chat.muted ? (
            <BellOff
              aria-label="Muted"
              className="size-3 shrink-0 text-[var(--color-fg-muted)]"
            />
          ) : null}
        </div>
        <span className="truncate text-[length:var(--text-xs)] text-[var(--color-fg-muted)]">
          {chat.lastMessage?.preview ?? 'No messages yet'}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {chat.unreadCount > 0 ? (
          <Badge aria-label={`${chat.unreadCount} unread`}>{chat.unreadCount}</Badge>
        ) : null}
        <ChatContextMenu chatId={chatId} muted={chat.muted} hasUnread={chat.unreadCount > 0}>
          <IconButton
            label={`Actions for ${chat.title}`}
            icon={<MoreHorizontal className="size-4" />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        </ChatContextMenu>
      </div>
    </NavLink>
  );
}

export const ChatListItem = memo(
  ChatListItemImpl,
  (a, b) => a.isActive === b.isActive && a.chat === b.chat,
);
