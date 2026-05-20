import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const themesDir = path.resolve(__dirname, 'themes');

const PAIRS: [string, string][] = [
  ['--color-fg-primary', '--color-bg-canvas'],
  ['--color-fg-secondary', '--color-bg-canvas'],
  ['--color-fg-muted', '--color-bg-canvas'],
  ['--color-accent-fg', '--color-accent'],
  ['--color-success-fg', '--color-success'],
  ['--color-warning-fg', '--color-warning'],
  ['--color-danger-fg', '--color-danger'],
];

// fg-muted only needs AA-Large (3:1); body fg needs AA (4.5:1).
const MIN_RATIO: Record<string, number> = {
  '--color-fg-muted': 3,
};

function parseTokens(file: string): Record<string, string> {
  const css = fs.readFileSync(file, 'utf8');
  const tokens: Record<string, string> = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const key = m[1];
    const value = m[2];
    if (key && value !== undefined) {
      tokens[key] = value.trim();
    }
  }
  return tokens;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function parseHsl(value: string): [number, number, number] | null {
  const cleaned = value.replace(/\s*\/\s*[\d.]+/, '').trim();
  const m = /hsl\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i.exec(cleaned);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]);
  const l = Number(m[3]);
  if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l)) return null;
  return hslToRgb(h, s, l);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => {
    const sc = c / 255;
    return sc <= 0.03928 ? sc / 12.92 : Math.pow((sc + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lo, hi] = la < lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = ['light.css', 'dark.css', 'highContrast.css'] as const;

describe('token contrast (WCAG AA)', () => {
  for (const file of THEMES) {
    const full = path.join(themesDir, file);
    const tokens = parseTokens(full);

    for (const [fgKey, bgKey] of PAIRS) {
      const fgRaw = tokens[fgKey];
      const bgRaw = tokens[bgKey];
      if (!fgRaw || !bgRaw) continue;

      it(`${file}: ${fgKey} on ${bgKey}`, () => {
        const fg = parseHsl(fgRaw);
        const bg = parseHsl(bgRaw);
        expect(fg, `unparseable ${fgKey}=${fgRaw}`).not.toBeNull();
        expect(bg, `unparseable ${bgKey}=${bgRaw}`).not.toBeNull();
        if (!fg || !bg) return;
        const ratio = contrastRatio(fg, bg);
        const min = MIN_RATIO[fgKey] ?? 4.5;
        expect(ratio).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
