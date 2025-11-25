import type { Meta, StoryObj } from "@storybook/react";
import { FormField } from "./FormField";
import { Input } from "./Input";

const meta: Meta<typeof FormField> = {
  title: "Primitives/FormField",
  component: FormField,
  args: {
    label: "Tenant alias",
    hint: "Unique slug used across environments"
  }
};

export default meta;

type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  render: (args) => (
    <FormField {...args}>
      <Input placeholder="acme-co" />
    </FormField>
  )
};

export const WithError: Story = {
  render: (args) => (
    <FormField {...args} error="Alias already taken">
      <Input placeholder="acme-co" error />
    </FormField>
  )
};
