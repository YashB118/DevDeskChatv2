import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/design-system/primitives/Button';
import { SectionHeader } from './SectionHeader';

const meta: Meta<typeof SectionHeader> = {
  title: 'Compounds/SectionHeader',
  component: SectionHeader,
  args: {
    title: 'Assignments',
    description: 'Chats currently routed to developers.',
    action: <Button size="sm">New</Button>,
  },
};
export default meta;

type Story = StoryObj<typeof SectionHeader>;
export const Default: Story = {};
