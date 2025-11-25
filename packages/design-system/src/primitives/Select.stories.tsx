import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./Select";

const meta: Meta<typeof Select> = {
  title: "Primitives/Select",
  component: Select,
  args: {
    defaultValue: "core"
  }
};

export default meta;

type Story = StoryObj<typeof Select>;

const options = (
  <>
    <option value="core">Core</option>
    <option value="pro">Pro</option>
    <option value="enterprise">Enterprise</option>
  </>
);

export const Default: Story = {
  args: {
    children: options
  }
};

export const WithError: Story = {
  args: {
    error: true,
    children: options
  }
};

