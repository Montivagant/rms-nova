/* c8 ignore start */
import "./styles.css";

export const tokens = {
  color: {
    brand: {
      base: "#2563eb",
      hover: "#1d4ed8"
    },
    surface: "#ffffff",
    surfaceMuted: "#f8fafc",
    border: "#d0d5dd",
    text: "#111827",
    textMuted: "#475467"
  },
  radius: {
    sm: 6,
    md: 8
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16
  }
} as const;

export { Button } from "./primitives/Button";
export { Input } from "./primitives/Input";
export { Card } from "./primitives/Card";
export { FormField } from "./primitives/FormField";
export { Textarea } from "./primitives/Textarea";
export { Checkbox } from "./primitives/Checkbox";
export { RadioGroup } from "./primitives/RadioGroup";
export { Select } from "./primitives/Select";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./primitives/Button";
export type { InputProps } from "./primitives/Input";
export type { CardProps } from "./primitives/Card";
export type { FormFieldProps } from "./primitives/FormField";
export type { TextareaProps } from "./primitives/Textarea";
export type { CheckboxProps } from "./primitives/Checkbox";
export type { RadioGroupProps, RadioGroupOption, RadioGroupDirection } from "./primitives/RadioGroup";
export type { SelectProps } from "./primitives/Select";
/* c8 ignore stop */
