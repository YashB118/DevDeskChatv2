import type { ReactElement } from 'react';
import { EmptyState } from '@/design-system/compounds/EmptyState';

export function SessionsPage(): ReactElement {
  return <EmptyState title="Sessions" description="Session management ships in Phase 9." />;
}
