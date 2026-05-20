import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Input } from './Input';

describe('Input', () => {
  it('forwards aria-invalid', () => {
    render(<Input aria-invalid aria-label="email" defaultValue="bad" />);
    expect(screen.getByLabelText('email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('passes axe with a label', async () => {
    const { container } = render(
      <>
        <label htmlFor="email-input">Email</label>
        <Input id="email-input" defaultValue="hi" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
