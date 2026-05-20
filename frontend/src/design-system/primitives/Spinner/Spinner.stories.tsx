import type { Meta, StoryObj } from '@storybook/react';
import { Spinner } from './Spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Primitives/Spinner',
  component: Spinner,
  argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg'] } },
};
export default meta;

type Story = StoryObj<typeof Spinner>;
export const Default: Story = {};
