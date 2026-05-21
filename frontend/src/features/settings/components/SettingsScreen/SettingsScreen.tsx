import type { ReactElement } from 'react';
import { Switch } from '@/design-system/primitives/Switch';
import { SectionHeader } from '@/design-system/compounds/SectionHeader';
import { useTheme, THEME_OPTIONS, type ThemePreference } from '@/design-system/theme';
import { useSettingsStore } from '@/shared/state/settings';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '@/lib/notifications/permission';
import { playNotificationSound } from '@/lib/notifications/sound';
import { Button } from '@/design-system/primitives/Button';

const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  'high-contrast': 'High contrast',
  system: 'System',
};

export function SettingsScreen(): ReactElement {
  const { preference, setPreference } = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const setNotifications = useSettingsStore((s) => s.setNotifications);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const onToggleDesktop = (next: boolean): void => {
    setNotifications({ desktopEnabled: next });
    if (next && getNotificationPermission() === 'default') {
      void requestNotificationPermission();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4">
        <SectionHeader title="Appearance" description="Theme used across the app." />
        <div className="flex flex-col gap-2">
          <label htmlFor="theme-select" className="text-[length:var(--text-sm)] font-medium">
            Theme
          </label>
          <select
            id="theme-select"
            className="h-10 w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] px-2"
            value={preference}
            onChange={(e) => {
              setPreference(e.target.value as ThemePreference);
            }}
          >
            {THEME_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {THEME_LABEL[opt]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4">
        <SectionHeader
          title="Notifications"
          description="Desktop notifications, sound, and favicon unread badge."
        />
        <div className="flex flex-col gap-3 text-[length:var(--text-sm)]">
          <div className="flex items-center justify-between gap-3">
            <span id="settings-desktop-label">Desktop notifications</span>
            <Switch
              aria-labelledby="settings-desktop-label"
              checked={settings.notifications.desktopEnabled}
              onCheckedChange={onToggleDesktop}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span id="settings-sound-label">Notification sound</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  playNotificationSound();
                }}
              >
                Preview
              </Button>
              <Switch
                aria-labelledby="settings-sound-label"
                checked={settings.notifications.soundEnabled}
                onCheckedChange={(next) => {
                  setNotifications({ soundEnabled: next });
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span id="settings-favicon-label">Favicon unread badge</span>
            <Switch
              aria-labelledby="settings-favicon-label"
              checked={settings.notifications.faviconBadgeEnabled}
              onCheckedChange={(next) => {
                setNotifications({ faviconBadgeEnabled: next });
              }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4">
        <SectionHeader title="Language" description="i18n scaffolding — single locale today." />
        <div className="flex flex-col gap-2">
          <label htmlFor="lang-select" className="text-[length:var(--text-sm)] font-medium">
            Language
          </label>
          <select
            id="lang-select"
            className="h-10 w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] px-2"
            value={settings.language}
            onChange={(e) => {
              setLanguage(e.target.value);
            }}
          >
            <option value="en">English</option>
          </select>
        </div>
      </section>
    </div>
  );
}
