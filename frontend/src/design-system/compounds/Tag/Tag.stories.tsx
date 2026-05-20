import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = {
  title: 'Compounds/Tag',
  component: Tag,
  args: { children: 'urgent' },
};
export default meta;

type Story = StoryObj<typeof Tag>;
export const Plain: Story = {};
export const Removable: Story = { args: { onRemove: () => undefined } };
