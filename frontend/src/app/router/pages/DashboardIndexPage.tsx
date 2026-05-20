import type { ReactElement } from 'react';
import { EmptyState } from '@/design-system/compounds/EmptyState';

export function DashboardIndexPage(): ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        title="Pick a chat"
        description="Select a conversation from the sidebar to start messaging."
      />
    </div>
  );
}
