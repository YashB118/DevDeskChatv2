import type { Meta, StoryObj } from '@storybook/react';
import { Search, Trash2 } from '@/design-system/icons';
import { IconButton } from './IconButton';

const meta: Meta<typeof IconButton> = {
  title: 'Compounds/IconButton',
  component: IconButton,
  args: { label: 'Search', icon: <Search className="h-4 w-4" /> },
};
export default meta;

type Story = StoryObj<typeof IconButton>;
export const Default: Story = {};
export const Danger: Story = { args: { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, variant: 'danger' } };
