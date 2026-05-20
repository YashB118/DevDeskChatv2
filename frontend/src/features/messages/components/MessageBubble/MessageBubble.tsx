import { memo, type ReactElement } from 'react';
import { Check, CheckCheck } from '@/design-system/icons';
import { toMessageId } from '@/shared/types/ids';
import type { MessageDTO } from '../../types';
import { MessageReactions } from '../MessageReactions/MessageReactions';
import { MessageQuotedPreview } from '../MessageQuotedPreview/MessageQuotedPreview';

interface MessageBubbleProps {
  message: MessageDTO;
  currentUserId: string | null;
  highlight: string;
  onReact: (emoji: string | null) => void;
  onEdit?: (id: ReturnType<typeof toMessageId>) => void;
  onDelete?: (id: ReturnType<typeof toMessageId>) => void;
  onRetry?: (id: ReturnType<typeof toMessageId>) => void;
}

function AckIcon({ state }: { state: MessageDTO['ackState'] }): ReactElement | null {
  if (!state) return null;
  if (state === 'SENT') return <Check aria-label="Sent" className="size-3" />;
  if (state === 'DELIVERED') return <CheckCheck aria-label="Delivered" className="size-3" />;
  return (
    <CheckCheck
      aria-label={state === 'PLAYED' ? 'Played' : 'Read'}
      className="size-3 text-[var(--color-accent)]"
    />
  );
}

function highlightBody(body: string, query: string): ReactElement {
  if (!query) return <>{body}</>;
  const idx = body.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{body}</>;
  const before = body.slice(0, idx);
  const match = body.slice(idx, idx + query.length);
  const after = body.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="rounded-[var(--radius-sm)] bg-[var(--color-accent)]/30 px-0.5">{match}</mark>
      {after}
    </>
  );
}

function MessageBubbleImpl({
  message,
  currentUserId,
  highlight,
  onReact,
  onRetry,
}: MessageBubbleProps): ReactElement {
  const isMine = currentUserId !== null && message.senderId === currentUserId;
  const isDeleted = !!message.deletedAt;
  const align = isMine ? 'self-end' : 'self-start';
  const bg = isMine ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-bg-elevated)]';

  if (message.type === 'SYSTEM') {
    return (
      <div className="my-1 self-center text-[length:var(--text-xs)] text-[var(--color-fg-muted)]">
        {message.body}
      </div>
    );
  }

  return (
    <article
      data-status={message.status}
      className={`max-w-[70%] rounded-[var(--radius-lg)] px-3 py-2 ${align} ${bg}`}
    >
      {!isMine && message.senderName ? (
        <div className="mb-1 text-[length:var(--text-xs)] font-medium text-[var(--color-accent)]">
          {message.senderName}
        </div>
      ) : null}
      {message.forwarded ? (
        <div className="mb-1 text-[length:var(--text-xs)] italic text-[var(--color-fg-muted)]">
          Forwarded
        </div>
      ) : null}
      {message.quoted ? <MessageQuotedPreview quoted={message.quoted} /> : null}
      <div className="whitespace-pre-wrap text-[length:var(--text-sm)]">
        {isDeleted ? (
          <span className="italic text-[var(--color-fg-muted)]">Message deleted</span>
        ) : (
          highlightBody(message.body, highlight)
        )}
      </div>
      <footer className="mt-1 flex items-center justify-end gap-1 text-[length:var(--text-xs)] text-[var(--color-fg-muted)]">
        {message.editedAt && !isDeleted ? <span>edited</span> : null}
        <time dateTime={new Date(message.ts).toISOString()}>
          {new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
        {isMine ? <AckIcon state={message.ackState} /> : null}
        {message.status === 'pending' ? <span aria-label="Sending">…</span> : null}
        {message.status === 'failed' ? (
          <button
            type="button"
            onClick={() => onRetry?.(toMessageId(message.id))}
            className="text-[var(--color-danger)] underline"
          >
            Failed — retry
          </button>
        ) : null}
      </footer>
      <MessageReactions
        reactions={message.reactions}
        currentUserId={currentUserId}
        onToggle={onReact}
      />
    </article>
  );
}

export const MessageBubble = memo(
  MessageBubbleImpl,
  (a, b) =>
    a.message === b.message &&
    a.currentUserId === b.currentUserId &&
    a.highlight === b.highlight,
);
