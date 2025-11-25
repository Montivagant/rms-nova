import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { Button } from "../primitives/Button";
import { Input } from "../primitives/Input";
import { Textarea } from "../primitives/Textarea";
import { Card } from "../primitives/Card";
import { FormField } from "../primitives/FormField";
import { Checkbox } from "../primitives/Checkbox";
import { RadioGroup } from "../primitives/RadioGroup";
import { Select } from "../primitives/Select";

describe("Design system primitives", () => {
  it("renders button with text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("marks input as invalid when error flag is set", () => {
    render(<Input error placeholder="Email" />);
    const input = screen.getByPlaceholderText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("renders card with title", () => {
    render(<Card title="Card title">Body</Card>);
    expect(screen.getByText("Card title")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("wires form field hint and error accessibility metadata", () => {
    render(
      <FormField label="Email" hint="We only use work email" error="Email is required">
        <Input placeholder="name@company.com" />
      </FormField>
    );

    const input = screen.getByPlaceholderText("name@company.com");
    const hint = screen.getByText("We only use work email");
    const error = screen.getByText("Email is required");

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(error).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const ariaDescribedBy = input.getAttribute("aria-describedby") ?? "";
    expect(ariaDescribedBy).toContain(hint.id);
    expect(ariaDescribedBy).toContain(error.id);
  });

  it("supports required indicator without hint or error content", () => {
    render(
      <FormField label="Full name" required>
        <Input placeholder="Jane Doe" />
      </FormField>
    );

    expect(screen.getByText("*")).toHaveClass("nova-form-field__required");
    const input = screen.getByPlaceholderText("Jane Doe");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
  it("renders textarea with default rows and error state", () => {
    render(<Textarea error defaultValue="notes" />);
    const textarea = screen.getByDisplayValue("notes");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("rows", "3");
    expect(textarea).toHaveClass("nova-textarea--error");
  });

  it("renders checkbox with label and handles checked state", () => {
    render(<Checkbox label="Enable option" defaultChecked />);
    const checkbox = screen.getByLabelText("Enable option");
    expect(checkbox).toBeChecked();
  });

  it("renders select with options and error state", () => {
    render(
      <Select error defaultValue="core" aria-label="Plan">
        <option value="core">Core</option>
        <option value="pro">Pro</option>
      </Select>
    );
    const select = screen.getByLabelText("Plan");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveClass("nova-select--error");
  });

  it("renders radio group and fires change events", () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        options={[
          { value: "core", label: "Core" },
          { value: "pro", label: "Pro" }
        ]}
        defaultValue="core"
        onChange={onChange}
      />
    );

    const proRadio = screen.getByLabelText("Pro");
    expect(screen.getByLabelText("Core")).toBeChecked();
    fireEvent.click(proRadio);
    expect(onChange).toHaveBeenCalledWith("pro");
    expect(proRadio).toBeChecked();
  });
});
