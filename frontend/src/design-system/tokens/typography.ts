export const fontFamily = {
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
} as const;

export const fontSize = {
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  md: 'var(--text-md)',
  lg: 'var(--text-lg)',
  xl: 'var(--text-xl)',
  '2xl': 'var(--text-2xl)',
} as const;

export const lineHeight = {
  tight: 'var(--leading-tight)',
  normal: 'var(--leading-normal)',
  loose: 'var(--leading-loose)',
} as const;

export type FontSizeToken = keyof typeof fontSize;
