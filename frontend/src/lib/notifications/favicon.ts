/**
 * Canvas-based favicon unread badge. Throttled: only redraws when the count
 * actually changes.
 */
let lastDrawnCount = -1;
let originalHref: string | null = null;

function getFaviconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  originalHref ??= link.href;
  return link;
}

function drawBadge(count: number): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = count > 99 ? '99+' : String(count);
  ctx.fillText(label, 16, 17);
  return canvas.toDataURL('image/png');
}

export function setFaviconBadge(count: number): void {
  if (count === lastDrawnCount) return;
  const link = getFaviconLink();
  if (!link) return;
  if (count <= 0) {
    if (originalHref) link.href = originalHref;
  } else {
    const url = drawBadge(count);
    if (url) link.href = url;
  }
  lastDrawnCount = count;
}

export function resetFaviconBadge(): void {
  lastDrawnCount = -1;
  const link = getFaviconLink();
  if (link && originalHref) link.href = originalHref;
}
