import type { ReactElement } from 'react';
import type { QuotedRef } from '../../types';

interface MessageQuotedPreviewProps {
  quoted: QuotedRef;
}

export function MessageQuotedPreview({ quoted }: MessageQuotedPreviewProps): ReactElement {
  return (
    <blockquote className="mb-1 border-l-2 border-[var(--color-accent)] pl-2 text-[length:var(--text-xs)] text-[var(--color-fg-muted)]">
      <span className="block truncate">{quoted.preview}</span>
    </blockquote>
  );
}
