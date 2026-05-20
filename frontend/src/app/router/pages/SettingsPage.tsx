import type { ReactElement } from 'react';
import { PasswordChangeForm } from '@/features/auth';

export function SettingsPage(): ReactElement {
  return (
    <div className="mx-auto max-w-xl space-y-8 p-6">
      <header>
        <h2 className="text-[length:var(--text-xl)] font-semibold">Settings</h2>
        <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">
          Theme and notification preferences land in Phase 10.
        </p>
      </header>
      <section aria-label="Change password">
        <h3 className="mb-3 text-[length:var(--text-lg)] font-medium">Change password</h3>
        <PasswordChangeForm />
      </section>
    </div>
  );
}
