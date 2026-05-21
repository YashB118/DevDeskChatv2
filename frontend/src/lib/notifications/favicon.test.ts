import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setFaviconBadge, resetFaviconBadge } from './favicon';

// jsdom does not implement <canvas>; stub a minimal 2d context + toDataURL.
function stubCanvas(): void {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,STUB');
}

beforeEach(() => {
  document.head.innerHTML = '<link rel="icon" href="/orig.png" />';
  resetFaviconBadge();
  stubCanvas();
});

describe('favicon badge', () => {
  it('writes a data URL when count > 0', () => {
    setFaviconBadge(3);
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")!;
    expect(link.href.startsWith('data:image/png')).toBe(true);
  });

  it('restores original href when count drops to 0', () => {
    setFaviconBadge(3);
    setFaviconBadge(0);
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")!;
    expect(link.href.endsWith('/orig.png')).toBe(true);
  });

  it('is throttled — no redraw for same count', () => {
    setFaviconBadge(5);
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")!;
    const first = link.href;
    setFaviconBadge(5);
    expect(link.href).toBe(first);
  });
});
