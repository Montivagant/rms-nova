import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup } from "./RadioGroup";

const meta: Meta<typeof RadioGroup> = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
  args: {
    options: [
      { value: "core", label: "Core plan" },
      { value: "pro", label: "Pro plan", description: "Adds menu + reporting" }
    ]
  }
};

export default meta;

type Story = StoryObj<typeof RadioGroup>;

export const Vertical: Story = {
  args: {
    defaultValue: "core"
  }
};

export const Horizontal: Story = {
  args: {
    defaultValue: "pro",
    direction: "horizontal"
  }
};
