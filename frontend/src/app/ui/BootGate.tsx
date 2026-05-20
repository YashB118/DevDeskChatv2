import type { ReactElement } from 'react';

export function BootGate(): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui',
        color: '#666',
      }}
    >
      <span>Loading…</span>
    </div>
  );
}
