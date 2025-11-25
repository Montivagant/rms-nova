import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "./Textarea";

const meta: Meta<typeof Textarea> = {
  title: "Primitives/Textarea",
  component: Textarea,
  args: {
    placeholder: "Leave an internal note"
  }
};

export default meta;

type Story = StoryObj<typeof Textarea>;

export const Default: Story = {};

export const ErrorState: Story = {
  args: {
    error: true,
    defaultValue: "Reason required when rejecting"
  }
};
