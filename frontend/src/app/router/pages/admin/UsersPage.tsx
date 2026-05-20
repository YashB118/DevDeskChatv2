import type { ReactElement } from 'react';
import { DeveloperManagementPanel } from '@/features/admin';
import { GlobalMuteToggle } from '@/features/mute';

export function UsersPage(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <DeveloperManagementPanel />
      <section
        aria-label="Global notifications"
        className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4"
      >
        <GlobalMuteToggle />
      </section>
    </div>
  );
}
