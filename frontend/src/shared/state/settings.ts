import { create } from 'zustand';
import { SettingsSchema, DEFAULT_SETTINGS, type Settings } from './settings.types';

const STORAGE_KEY = 'settings:v1';

function load(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = SettingsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      window.localStorage.removeItem(STORAGE_KEY);
      return DEFAULT_SETTINGS;
    }
    return parsed.data;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota / serialization — silently skip
  }
}

interface SettingsState {
  settings: Settings;
  setNotifications: (next: Partial<Settings['notifications']>) => void;
  setLanguage: (lang: string) => void;
  reset: () => void;
}

/**
 * Cross-feature user preferences. Lives in `shared/` so notifications,
 * settings UI, and any other consumer can read without crossing feature
 * boundaries. The settings UI feature owns the form; this store owns the data.
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: load(),
  setNotifications: (next) => {
    const merged: Settings = {
      ...get().settings,
      notifications: { ...get().settings.notifications, ...next },
    };
    set({ settings: merged });
    save(merged);
  },
  setLanguage: (lang) => {
    const merged: Settings = { ...get().settings, language: lang };
    set({ settings: merged });
    save(merged);
  },
  reset: () => {
    set({ settings: DEFAULT_SETTINGS });
    save(DEFAULT_SETTINGS);
  },
}));
