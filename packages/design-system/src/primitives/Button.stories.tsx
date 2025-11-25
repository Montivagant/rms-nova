import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  args: {
    children: "Primary action"
  }
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: "primary"
  }
};

export const Ghost: Story = {
  args: {
    variant: "ghost"
  }
};

export const Outline: Story = {
  args: {
    variant: "outline"
  }
};

export const AsLink: Story = {
  args: {
    asChild: true,
    children: <a href="https://example.com">Visit details</a>
  }
};
