export const duration = {
  fast: 'var(--motion-fast)',
  base: 'var(--motion-base)',
  slow: 'var(--motion-slow)',
} as const;

export const durationMs = {
  fast: 120,
  base: 220,
  slow: 360,
} as const;

export const easing = {
  standard: 'var(--easing-standard)',
  emphasized: 'var(--easing-emphasized)',
  entry: 'var(--easing-entry)',
  exit: 'var(--easing-exit)',
} as const;

export const easingTuple = {
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.3, 0, 0, 1] as const,
  entry: [0, 0, 0, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
};

export type DurationToken = keyof typeof duration;
export type EasingToken = keyof typeof easing;
