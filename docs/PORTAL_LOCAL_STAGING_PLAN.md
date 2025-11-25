# Nova Portal - Local/Staging Playbook

This plan consolidates what it takes to keep the tenant portal fully operational in local and staging environments _without_ depending on managed production APIs yet. It also documents how today's capabilities stack up against the broader RMS mission and which UI/UX upgrades we should prioritize next.

## 1. Local/Staging Execution Strategy

### Deterministic data & placeholder APIs
- `tests/e2e/portal/run-portal-with-mock.ts` launches both the portal dev server and the deterministic mock API (`tests/e2e/portal/mock-api-server.ts`) on `127.0.0.1:3999`.
- Set `PLAYWRIGHT_PORTAL_API_MODE=mock` (default) to keep the placeholder flow entirely backend-free, or `PLAYWRIGHT_PORTAL_API_MODE=live` to skip the mock server and point the portal at a real API target supplied via `PORTAL_API_BASE_URL` / `NEXT_PUBLIC_PORTAL_API_BASE_URL`.
- `playwright.portal.config.ts` already points Playwright at this launcher; set `PLAYWRIGHT_PORTAL_API_HOST` / `PLAYWRIGHT_PORTAL_API_PORT` if the default port(s) are occupied.
- For POS sandbox testing in live API mode, set `PAYMENT_PROVIDER_MODE=sandbox` and choose `PAYMENT_PROVIDER_SANDBOX_OUTCOME=completed|pending|failed` to exercise payment/refund status handling before a real provider is wired in.
- When `PAYMENT_PROVIDER_MODE=sandbox`, run `pnpm dev:payments-sandbox` so capture/refund calls hit an HTTP endpoint (`PAYMENT_PROVIDER_SANDBOX_BASE_URL`) and settlement webhooks bounce back to `/v1/portal/pos/payments/:paymentId/status` via `PAYMENT_PROVIDER_WEBHOOK_SECRET`. The script mimics a gateway even when statuses are forced to `pending`/`failed`.
- For manual browsing without Playwright, run:
  ```powershell
  # 1. start the mock API
  pnpm tsx tests/e2e/portal/mock-api-server.ts

  # 2. in another shell, run the portal (pointed at the mock)
  $env:PORTAL_API_BASE_URL = "http://127.0.0.1:3999"
  pnpm --filter @nova/portal dev
  ```
  or bring up the full stack (`pnpm dev:stack`) when you do want to exercise the real API.
- The mock responds to every `/v1/portal/**` endpoint we currently use (dashboard, context, locations + assignments, menu, modifiers, inventory, POS tickets, payments, reporting) and exposes `POST /__mock__/reset` so Playwright can reset state before each test.
- When you want to exercise the **real** APIs (account, inventory adjustments/audit, inventory counts/reconcile, menu create/edit/modifiers, POS quick sale + refunds), point `PORTAL_API_BASE_URL` (or `NEXT_PUBLIC_PORTAL_API_BASE_URL`) at the running Fastify instance (`pnpm --filter @nova/api dev`). The Next.js API routes under `/api/account/**` simply proxy to `/v1/portal/account/**`, so they require a working backend + authenticated tenant context.

### Database & sample data
- Follow `db/README.md` to keep `rms_dev` / `rms_test` in Docker Desktop (`nova-postgres`) or local installs; migrations run via `pnpm --filter @nova/api db:migrate`.
- `scripts/seed-sample-data.ts` seeds deterministic menu/inventory/POS data for tenants when you want live API-backed flows.
- For placeholder-only sessions, no DB access is required - the mock server hydrates itself from `@nova/sample-data`.

### Environment files
- Root `.env`: database URLs, JWT secrets, worker health ports.
- `apps/portal/.env.local`: typically `PORTAL_API_BASE_URL=http://localhost:3000` when talking to the dev API; point it at the mock server when you want a backend-free run.
- `PLAYWRIGHT_PORTAL_PORT`, `PLAYWRIGHT_PORTAL_BASE_URL`, and the host/port overrides above live entirely in the Playwright config so CI/local runs stay isolated from your personal environment files, while `PLAYWRIGHT_PORTAL_API_MODE` toggles mock (`mock`) vs. live (`live`) API behaviour for the launcher.

## 2. Feature Alignment vs. RMS Mission

| Business driver (01_Context.md) | Expected capability in RMS | Current status | Gaps / follow-ups |
| --- | --- | --- | --- |
| Multi-location consistency | Operators need per-location inventory/menu overrides with scoped access. | `/v1/portal/locations/:id/assignments` implemented with RBAC checks, deterministic sample data includes managed locations; UI mirrors permissions. | Need richer presets (bulk assignment templates) and ability to compare locations side-by-side (tracked in TODO-14 backlog). |
| Deterministic, low-risk iterations | Develop locally/staging before production re-opens. | Mock API + sample-data fallbacks unblock portals & Playwright without real APIs, docs updated. | Continue to keep Terraform/Helm staging overlays in sync; once production resumes, add a regression pass that targets the real API host. |
| Menu, inventory, POS authoring | Menu item CRUD, modifiers, inventory adjustments, POS tickets, reporting insights. | All flows exist (create/edit menu, modifiers, inventory adjustments, POS quick sale, payments/reporting dashboards). POS quick sale now records full payment metadata (processor, tender brand/last4, receipt URL) and feeds the reporting/payments tables. `/inventory/reconcile` drives the live `/v1/portal/inventory/counts/**` APIs to sync stock levels, audit movements, and surface CSV exports for every session. | Still need advanced validation (multi-currency, allergen tags), undo/rollback patterns, reconciliation attachments/evidence, and live payment provider capture/settlement/refunds with UI states. |
| Reporting & insights | Analysts want advanced reporting with feature-flag gating. | `advanced_reporting` flag wired end-to-end, widgets + CSV exports fall back cleanly to sample data. | Build drill-through experiences (click rows -> detail modals) and export batching; ensure real API coverage once staging data is reliable. |
| Loyalty engagement | POS + portal should accrue/redeem balances tied to customers. | `/v1/portal/loyalty/overview`, `/loyalty/accounts/:accountId`, `/loyalty/earn`, and `/loyalty/redeem` endpoints now exist with deterministic sample data plus tests, and the `/loyalty` workspace renders balances, history, and guarded earn/redeem forms. Quick-sale tickets (and inline refunds) now propagate loyalty customer ids so points are awarded/deducted automatically. | Build deeper POS hooks, expiration logic, and operational drills so the new workflows get first-class coverage. |
| Operations guardrails | Runbooks, drills, backups, and Terraform/Helm overlays keep environments honest. | `ops/` docs, billing drills, and ENVIRONMENT_SETUP highlight local/staging focus. | Add an explicit acceptance checklist for the mock API workflow (CI status badge + documentation for triaging failures). |
| Inventory audits & evidence | Auditors need a traceable log of adjustments per location. | `/inventory` now renders the real audit log from `/v1/portal/inventory/audit` (falling back to the mock only when the API is unreachable). Adjustments created in the portal hit `/v1/portal/inventory/items/:id/adjustments` or the new count session endpoints, update stock levels, and appear in the audit table with user + location context, and count sessions expose CSV exports plus attachment slots. | Next: add filters (location/date/user), inline previews, and richer bundling so reconciliation evidence stays organized. |
| Account workspace | Operators need to manage profile/business metadata that syncs across invoices, statements, and support. | `/account` hits real APIs (`/v1/portal/account/profile` + `/v1/portal/account/business`) via the Next.js API proxy, so profile/business updates now persist in Postgres (`tenant_business_profiles`, `users`). Avatars/menu imagery remain local placeholders until media storage lands. | Next: connect the media dropzone to object storage, surface validation errors inline, and add Playwright coverage for both profile + business update flows. |

## 3. User Flow Coverage (Local/Staging)

| Flow | Entry points & dependencies | Local/staging behavior today | Gaps / planned enhancements |
| --- | --- | --- | --- |
| Tenant signup & approval | `pnpm seed:tenant` CLI (or superadmin portal `/registrations` when API is running) flows through `/v1/auth/register` + `/v1/superadmin/registrations/:id/approve`. Requires API + Postgres, optional email stubs. | CLI seeds deterministic business + owner data and can run entirely on localhost; Playwright mocks are not used for signup so we rely on vitest/integration coverage. | No UI for self-service signup in the tenant portal yet; need a public landing experience + captcha before launch. |
| Portal login / session management | `/login` posts to `/api/session`, which proxies `/v1/auth/login`; session stored in HTTP-only cookie, guard middleware enforces auth for `/`. | Works against real API; when only the mock API is running we inject `PORTAL_ACCESS_TOKEN` as part of Playwright config, so manual login requires the API. | Add forgot-password + MFA prompts, plus user feedback when accounts are disabled. Need a scripted path to provision credentials when only the mock API is available. |
| Account & profile management | `/account` surfaces profile fields, avatar upload, business settings, and menu imagery staging, backed by `/v1/portal/account/**`. | Hits real APIs for profile/business updates via the Next.js proxy; avatar/menu imagery remain placeholder-only. | Add password reset + MFA controls, persist media to object storage, sync updates to the superadmin audit log, and cover with Playwright. |
| Business/tenant data management | Dashboard + shell consume `/v1/portal/context` to show plan, payouts, modules; superadmin portal handles edits via module toggles + billing flows. | Context card renders in both mock + real API modes; advanced edits live exclusively inside the superadmin workspace (API required). | Need tenant-facing "Business settings" page to edit branding, contact info, payouts (scoped by RBAC), plus a read-only summary in the portal header that deep links into superadmin when needed. |
| Location data | `/locations` SSR page hits `/v1/portal/locations` and `/v1/portal/locations/:id/assignments`, with server actions for inventory/menu assignments. | Fully supported locally via mock API + deterministic data; API-based flow already enforces RBAC and location scopes. | Upcoming work: comparison mode, bulk ops, and a timeline of changes per location. |
| Menu item / modifier authoring | `/menu` surfaces create/edit forms + modifier assignments via `/v1/portal/menu/**`. | Covered by mock API + Playwright; writes respond immediately in local/staging, but there's no imagery. | Add image upload per menu item (drag/drop, preview, object storage persistence) and integrate allergen/recipe metadata. |
| Inventory reconcile | `/inventory/reconcile` posts to `/v1/portal/inventory/counts/**` to start/count/complete sessions, writes audit entries, and now exposes CSV exports per session. | Runs against real API in local/staging; mock responds deterministically when API is offline. | Add attachments, richer evidence (photos/PDF), and Playwright coverage. |
| POS quick sale & refunds | `/pos` form calls `/v1/portal/pos/tickets` and `/v1/portal/pos/payments/:paymentId/refunds` with RBAC/location guards, and the payments table now renders inline refund controls that disable automatically when unsettled or fully refunded. | Runs against real API; mock responses remain deterministic for offline runs. Payment provider integration still absent. | Add provider-backed capture/settle/retry, receipt delivery, and broaden Playwright coverage in mock + live modes. |
| User/profile imagery | Target is `/v1/files` (future) for avatars + ID badges. | Not implemented; no upload inputs or storage buckets exist yet. | Design UX for profile picture capture (cropper, validation) and define storage policy (S3/GCS buckets, signed URLs). |
| Menu item imagery | Future `/v1/menu/items/:id/media` endpoint; design-system card will show thumbnails. | Not implemented; sample data has no image fields. | Extend sample data + mock server with placeholder images, build upload/dropzone UI, and ensure seeding + storage are deterministic for local/staging. |

## 4. UI/UX Enhancement Plan

Prioritized according to usability heuristics, accessibility requirements, and the RMS brand language (clean, high-signal dashboards).

1. **Navigation & wayfinding**
   - Add contextual breadcrumbs and active-state highlights when deep linking into module subsections (e.g., `/menu?itemId=...`).
   - Provide quick switchers for locations and feature flags directly in the sidebar to reduce clicks for power users.

2. **Data density & responsive grids**
   - Refactor dashboard cards and tables to use CSS container queries + clamp-based typography so 1280px, 1440px, and tablet widths show optimal columns.
   - Introduce "focus mode" toggles on dense tables (inventory, payments) so operators can hide filters once configured.

3. **Action affordances & guidance**
   - Replace disabled buttons with inline helper banners describing exactly which permission or feature flag is missing (improves clarity vs. tooltip-only messaging).
   - Add skeleton loaders for server components that currently flash empty states when falling back to sample data.

4. **Form UX & validation**
   - Standardize form grids (menu create/edit, inventory adjustments, POS quick sale) on a shared `<FormSection>` wrapper with consistent spacing, helper text, and error placement.
   - Adopt inline currency/percentage masks with locale-aware formatting to reduce mis-keyed values.

5. **Accessibility & theming**
   - Ensure every interactive element in the mock data states has visible focus rings and a `prefers-reduced-motion` alternative for loading spinners.
   - Expand the design-system token set with semantic colors for statuses (success/warning/error/info) so the portal can represent inventory alerts and payouts without ad-hoc hex codes.

6. **Insights revamp**
   - Layer small multiples and trend indicators onto the reporting/Payments modules (spark-lines, delta badges) to quickly show week-over-week momentum.
   - Add contextual "next best action" panels (e.g., surfaced when inventory stockouts are detected) tying the UI back to business KPIs.

Each enhancement will be broken down further inside `TODO.md` once we start implementing; the list above acts as the approved backlog from a UX best-practices standpoint.

---

**Hand-off:** Keep this document close while we iterate in local/staging. Any future placeholder work (new modules, additional mock endpoints) should be documented here so everyone sees the operational expectations alongside the business alignment and UX roadmap. For deeper cross-team workstreams (POS payments, loyalty, reconciliation, ops/testing), reference `docs/LOCAL_STAGING_COMPLETION_PLAN.md`, which tracks the execution order and deliverables for the remaining milestones.
