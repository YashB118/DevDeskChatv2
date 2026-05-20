import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/design-system/primitives/Button';
import { Plus, Search } from '@/design-system/icons';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Compounds/EmptyState',
  component: EmptyState,
  args: {
    icon: <Search />,
    title: 'No chats yet',
    description: 'When a chat is assigned to you it will show up here.',
    action: <Button leadingIcon={<Plus className="h-4 w-4" aria-hidden />}>Create</Button>,
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;
export const Default: Story = {};
