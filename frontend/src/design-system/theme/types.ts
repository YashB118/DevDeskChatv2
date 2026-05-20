export const THEME_OPTIONS = ['light', 'dark', 'high-contrast', 'system'] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'devdesk:theme';
