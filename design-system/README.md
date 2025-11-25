# Design System Guide

## Token Layers
- **Color** (`--color-*`): surface, text, brand, semantic (success/warning/error/info) with light/dark pairs.
- **Typography** (`--font-*`, `--text-*`): Inter for sans, JetBrains Mono for monospace; sizes `xs`–`4xl`, weights 400/500/600.
- **Spacing** (`--space-*`): 4px scale (`0.25rem` ? `3rem`).
- **Radius** (`--radius-*`): `sm` 4px, `md` 6px, `lg` 8px, `xl` 12px.
- **Shadow** (`--shadow-*`): subtle elevation presets.
- **Motion** (`--motion-duration-*`, `--motion-easing-standard`): 120/200/320ms, cubic-bezier(0.2,0,0.38,0.9).

Tokens live in `packages/design-system/src/tokens`, emitted as CSS variables + TS exports. Tenants override via CSS vars only.

## Primitive Components (current)
- `Button` (primary/ghost/outline; sm/md/lg; loading state).
- `Card` (surface container with heading/body slots).
- `Input`, `Textarea`, `Select` (form controls with shared error handling).
- `FormField` (wraps any control with label, hint, required indicator, error messaging, and aria wiring).
- `Checkbox` (includes label + optional indeterminate state).
- `RadioGroup` (vertical/horizontal layouts, option descriptions).

All primitives live in `packages/design-system/src/primitives` with stories + Vitest coverage. Styling uses CSS variables (no inline styles).

> Additional primitives (IconButton, Switch, overlay components, etc.) will land as part of the upcoming business-module polish; document them here only after they ship.

## Pattern Components
Pattern-level components are not yet published. Build flows by composing the primitives above; once patterns ship they’ll live under `packages/design-system/src/patterns` with Storybook docs.

## Accessibility Rules
- Contrast = 4.5:1 for text; tokens validated via automated tests.
- Focus visible using tokenized focus ring; respect `prefers-reduced-motion`.
- Components expose proper ARIA roles/attributes; live regions for toasts.
- Keyboard: tab/shift+tab order, arrow navigation for menus, escape to close overlays.

## Theming & Dark Mode
- Base tokens define light scheme; dark scheme via `[data-theme="dark"]` overrides.
- Tenant accent overrides allowed for `color.brand.{500,600}` with automatic contrast check.
- Persisted theme stored in local storage; SSR uses inline script to avoid flash.

## Implementation Notes
- Use Vite build, TS strict mode, Storybook for documentation.
- Unit tests with Testing Library + Jest DOM; visual regression via Playwright screenshot diff.
- Package exports limited via `packages/design-system/src/index.ts` to avoid breaking API.
- No component exposes inline style props; use tokens + className combiners.

## Usage Checklist
1. Import root CSS once per app: `import '@nova/design-system/styles.css';`
2. Wrap app with `ThemeProvider` and `ToastProvider`.
3. Use `Form` + `Input` patterns for forms; no raw `<input>` in product code.
4. Prefer `DataTable` for tabular data to get accessibility + sorting/pagination for free.
5. Document every new component with Storybook + MDX usage doc + accessibility matrix before merge.

## Storybook
- Run `pnpm --filter @nova/design-system storybook` to preview primitives while working locally (listens on `http://localhost:6006`).
- Generate a static bundle via `pnpm --filter @nova/design-system storybook:build` before sharing snapshots or publishing docs.





