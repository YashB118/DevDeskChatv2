import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../Button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './Dialog';

const meta: Meta<typeof Dialog> = {
  title: 'Primitives/Dialog',
  component: Dialog,
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm action</DialogTitle>
          <DialogDescription>This will mark the chat as read.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Confirm</Button>
          <Button variant="ghost">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
export default meta;

type Story = StoryObj<typeof Dialog>;
export const Default: Story = {};
