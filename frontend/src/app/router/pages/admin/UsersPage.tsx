import type { ReactElement } from 'react';
import { EmptyState } from '@/design-system/compounds/EmptyState';

export function UsersPage(): ReactElement {
  return <EmptyState title="Users" description="Developer management ships in Phase 9." />;
}
