/**
 * Single preloaded audio buffer. Uses a tiny inline data URL so we don't
 * need to bundle a separate asset; replace with a real ding when product
 * picks one.
 */

const TONE_DATA_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

let audio: HTMLAudioElement | null = null;

function ensure(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!audio) {
    audio = new Audio(TONE_DATA_URL);
    audio.preload = 'auto';
    audio.volume = 0.6;
  }
  return audio;
}

export function playNotificationSound(): void {
  const a = ensure();
  if (!a) return;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p instanceof Promise) {
      p.catch(() => undefined);
    }
  } catch {
    // browser may block playback without user gesture — fail silent
  }
}
