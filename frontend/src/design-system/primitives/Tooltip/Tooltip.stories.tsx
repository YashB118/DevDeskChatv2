import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../Button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './Tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>Helpful hint here.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof Tooltip>;
export const Default: Story = {};
