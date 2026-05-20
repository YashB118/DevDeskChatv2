import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../Button';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';

const meta: Meta<typeof Popover> = {
  title: 'Primitives/Popover',
  component: Popover,
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-[length:var(--text-sm)]">Inline rich content goes here.</p>
      </PopoverContent>
    </Popover>
  ),
};
export default meta;

type Story = StoryObj<typeof Popover>;
export const Default: Story = {};
