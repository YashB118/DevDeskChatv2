export const shadow = {
  1: 'var(--shadow-1)',
  2: 'var(--shadow-2)',
  3: 'var(--shadow-3)',
} as const;

export type ShadowToken = keyof typeof shadow;
