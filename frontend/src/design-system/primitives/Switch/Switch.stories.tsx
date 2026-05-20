import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from './Switch';

const meta: Meta<typeof Switch> = {
  title: 'Primitives/Switch',
  component: Switch,
  args: { 'aria-label': 'Toggle' },
};
export default meta;

type Story = StoryObj<typeof Switch>;
export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
