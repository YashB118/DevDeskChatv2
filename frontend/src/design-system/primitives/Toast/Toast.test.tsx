import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const { push } = useToast();
  return (
    <Button onClick={() => push({ title: 'Saved', description: 'Done', tone: 'success' })}>
      go
    </Button>
  );
}

describe('Toast', () => {
  it('pushes a toast with title and description', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});
