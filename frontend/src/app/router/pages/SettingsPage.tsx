import type { ReactElement } from 'react';
import { PasswordChangeForm } from '@/features/auth';
import { SettingsScreen } from '@/features/settings';

export function SettingsPage(): ReactElement {
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <header>
        <h2 className="text-[length:var(--text-xl)] font-semibold">Settings</h2>
        <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">
          Appearance, notifications, and language.
        </p>
      </header>
      <SettingsScreen />
      <section aria-label="Change password">
        <h3 className="mb-3 text-[length:var(--text-lg)] font-medium">Change password</h3>
        <PasswordChangeForm />
      </section>
    </div>
  );
}
