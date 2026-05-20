import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Textarea } from '@/design-system/primitives/Textarea';
import { Button } from '@/design-system/primitives/Button';
import type { ChatId } from '@/shared/types/ids';
import { useMessagesUIStore } from '../../store/messages.store';
import { useSendMessage } from '../../hooks/useMessageMutations';

interface MessageComposerProps {
  chatId: ChatId;
}

export function MessageComposer({ chatId }: MessageComposerProps): ReactElement {
  // Composer state is local to keep typing out of the global store and away
  // from the message list — the list never re-renders on keystrokes.
  const draft = useMessagesUIStore.getState().drafts[chatId] ?? '';
  const [value, setValue] = useState(draft);
  const setDraft = useMessagesUIStore((s) => s.setDraft);
  const clearDraft = useMessagesUIStore((s) => s.clearDraft);
  const { send, isSending } = useSendMessage(chatId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDraft(chatId, value);
    }, 300);
    return () => {
      clearTimeout(t);
    };
  }, [chatId, value, setDraft]);

  const submit = useCallback(async () => {
    const body = value.trim();
    if (!body || isSending) return;
    setValue('');
    clearDraft(chatId);
    try {
      await send({ body });
    } catch {
      setValue(body);
    }
  }, [value, isSending, send, chatId, clearDraft]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      aria-label="Send message"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex items-end gap-2 border-t border-[var(--color-border-subtle)] p-3"
    >
      <Textarea
        ref={textareaRef}
        aria-label="Message"
        placeholder="Type a message"
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className="max-h-40 min-h-9 flex-1 resize-none"
      />
      <Button type="submit" disabled={isSending || value.trim() === ''}>
        Send
      </Button>
    </form>
  );
}
