import { z } from 'zod';

export const SettingsSchema = z.object({
  notifications: z.object({
    desktopEnabled: z.boolean().default(false),
    soundEnabled: z.boolean().default(true),
    faviconBadgeEnabled: z.boolean().default(true),
  }),
  language: z.string().min(2).default('en'),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  notifications: {
    desktopEnabled: false,
    soundEnabled: true,
    faviconBadgeEnabled: true,
  },
  language: 'en',
};
