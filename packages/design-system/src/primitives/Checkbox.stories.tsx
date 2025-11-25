import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./Checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  args: {
    label: "Enable POS module"
  }
};

export default meta;

type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  args: {
    defaultChecked: true
  }
};

export const Indeterminate: Story = {
  args: {
    indeterminate: true
  }
};
