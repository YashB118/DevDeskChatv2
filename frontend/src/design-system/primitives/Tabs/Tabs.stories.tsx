import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Primitives/Tabs',
  component: Tabs,
  render: () => (
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
        <TabsTrigger value="three">Three</TabsTrigger>
      </TabsList>
      <TabsContent value="one">Panel one.</TabsContent>
      <TabsContent value="two">Panel two.</TabsContent>
      <TabsContent value="three">Panel three.</TabsContent>
    </Tabs>
  ),
};
export default meta;

type Story = StoryObj<typeof Tabs>;
export const Default: Story = {};
