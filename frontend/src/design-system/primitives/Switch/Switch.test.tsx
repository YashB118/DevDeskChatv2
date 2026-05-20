import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Switch } from './Switch';

describe('Switch', () => {
  it('toggles state on click', async () => {
    render(<Switch aria-label="Mute" />);
    const sw = screen.getByRole('switch', { name: 'Mute' });
    expect(sw).toHaveAttribute('data-state', 'unchecked');
    await userEvent.click(sw);
    expect(sw).toHaveAttribute('data-state', 'checked');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<Switch aria-label="Mute" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
