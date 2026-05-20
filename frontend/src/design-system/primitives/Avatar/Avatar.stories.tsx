import type { Meta, StoryObj } from '@storybook/react';
import { Avatar, AvatarFallback } from './Avatar';

const meta: Meta<typeof Avatar> = {
  title: 'Primitives/Avatar',
  component: Avatar,
  argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg'] } },
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>YB</AvatarFallback>
    </Avatar>
  ),
};
export default meta;

type Story = StoryObj<typeof Avatar>;
export const Small: Story = { args: { size: 'sm' } };
export const Medium: Story = { args: { size: 'md' } };
export const Large: Story = { args: { size: 'lg' } };
