import type { Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import { Button } from '../Button';
import { ToastProvider, useToast } from './Toast';

function ToastDemo(): ReactElement {
  const { push } = useToast();
  return (
    <div className="flex gap-2">
      <Button onClick={() => push({ title: 'Saved', description: 'Your edit was persisted.', tone: 'success' })}>
        Success
      </Button>
      <Button
        variant="danger"
        onClick={() => push({ title: 'Failure', description: 'Something went wrong.', tone: 'danger' })}
      >
        Failure
      </Button>
    </div>
  );
}

const meta: Meta = {
  title: 'Primitives/Toast',
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
export default meta;

type Story = StoryObj;
export const Default: Story = {};
