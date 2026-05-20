import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { THEME_STORAGE_KEY } from './types';

function Consumer() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => { setPreference('dark'); }}>dark</button>
      <button onClick={() => { setPreference('high-contrast'); }}>hc</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-preference');
  });

  it('updates data-theme attribute on the document', async () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('pref').textContent).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'hc' }));
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
  });
});
