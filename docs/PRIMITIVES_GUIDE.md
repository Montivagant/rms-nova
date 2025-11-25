# Design System Primitives Guide

> Applies to `packages/design-system` and the staging-first workflow (local + Minikube). Use these references before building tenant-facing UI; avoid creating bespoke components that diverge from these patterns. Run `pnpm --filter @nova/design-system storybook` to preview the components interactively.

## Button
- Variants: `primary`, `ghost`, `outline`.
- Sizes: `sm`, `md`, `lg`.
- Props: `disabled`, `type`, etc. (extends `button` attributes).
- Set `asChild` to render the styling on a link (`<Link>`/`<a>`) instead of a `<button>`.
- Usage:
  ```tsx
  import { Button } from "@nova/design-system";

  <Button variant="ghost" size="sm" onClick={...}>
    Secondary action
  </Button>
  ```

## Input
- Single-line text entry (`<input>`). Set `error` prop for validation styling + `aria-invalid`.
- Works inside `FormField` or standalone; width 100% by default.
  ```tsx
  <Input placeholder="Tenant name" error={!!errors.name} />
  ```

## Textarea
- Multi-line entry with `rows` defaulting to 3. `error` flag mirrors `Input`.
  ```tsx
  <Textarea rows={5} placeholder="Notes" />
  ```

## Select
- Native dropdown with consistent styling and optional `error` prop. Pair with `FormField` for labels/hints.
  ```tsx
  <Select defaultValue="core" error={hasError}>
    <option value="core">Core</option>
    <option value="pro">Pro</option>
  </Select>
  ```

## Checkbox
- Label baked into the component. Supports `indeterminate` prop (set via JS, not attribute).
  ```tsx
  <Checkbox label="Enable billing" defaultChecked />
  <Checkbox label="Select all" indeterminate />
  ```

## RadioGroup
- Render mutually exclusive choices with optional descriptions; supports controlled and uncontrolled usage, horizontal or vertical layout.
  ```tsx
  <RadioGroup
    direction="horizontal"
    options={[
      { value: "core", label: "Core", description: "POS + inventory" },
      { value: "pro", label: "Pro" }
    ]}
    defaultValue="core"
    onChange={(value) => console.log(value)}
  />
  ```

## FormField
- Wrap any control to wire labels, hints, required indicators, and error messaging.
  ```tsx
  <FormField
    label="Contact email"
    hint="Work email only"
    error={errors.email}
    required
  >
    <Input type="email" {...register("email")} />
  </FormField>
  ```

## Composition Tips
- Pair `FormField` + `Checkbox` (consent, onboarding tasks) or `RadioGroup` (decisions) for consistent accessibility; `FormField` wires `aria-describedby` automatically.
- Avoid inline styles: rely on `className` + provided CSS and tokens.
- Keep staging-first focus: preview components locally/staging before referencing them in production docs.

