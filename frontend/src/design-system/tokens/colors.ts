export const colors = {
  bg: {
    canvas: 'var(--color-bg-canvas)',
    elevated: 'var(--color-bg-elevated)',
    sunken: 'var(--color-bg-sunken)',
    overlay: 'var(--color-bg-overlay)',
  },
  fg: {
    primary: 'var(--color-fg-primary)',
    secondary: 'var(--color-fg-secondary)',
    muted: 'var(--color-fg-muted)',
    onAccent: 'var(--color-fg-on-accent)',
  },
  border: {
    subtle: 'var(--color-border-subtle)',
    default: 'var(--color-border-default)',
    strong: 'var(--color-border-strong)',
  },
  accent: {
    base: 'var(--color-accent)',
    hover: 'var(--color-accent-hover)',
    fg: 'var(--color-accent-fg)',
  },
  status: {
    success: 'var(--color-success)',
    successFg: 'var(--color-success-fg)',
    warning: 'var(--color-warning)',
    warningFg: 'var(--color-warning-fg)',
    danger: 'var(--color-danger)',
    dangerFg: 'var(--color-danger-fg)',
  },
  focusRing: 'var(--color-focus-ring)',
  overlayScrim: 'var(--color-overlay-scrim)',
} as const;

export type ColorToken = typeof colors;
