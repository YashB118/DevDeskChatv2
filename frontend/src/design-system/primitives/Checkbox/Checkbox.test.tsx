import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('toggles via keyboard', async () => {
    render(<Checkbox aria-label="Agree" />);
    const cb = screen.getByRole('checkbox', { name: 'Agree' });
    expect(cb).toHaveAttribute('data-state', 'unchecked');
    cb.focus();
    await userEvent.keyboard(' ');
    expect(cb).toHaveAttribute('data-state', 'checked');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<Checkbox aria-label="Agree" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
