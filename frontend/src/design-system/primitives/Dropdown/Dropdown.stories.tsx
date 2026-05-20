import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './Dropdown';

const meta: Meta<typeof DropdownMenu> = {
  title: 'Primitives/Dropdown',
  component: DropdownMenu,
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Chat</DropdownMenuLabel>
        <DropdownMenuItem>Mark read</DropdownMenuItem>
        <DropdownMenuItem>Mute</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
export default meta;

type Story = StoryObj<typeof DropdownMenu>;
export const Default: Story = {};
