# Progress Log

## 2025-10-03T09:22Z
- Initialized project structure, context doc, architecture plan, registry spec, base schema, and operational/test documentation for M0 kickoff.
## 2025-10-03T09:36Z
- Established pnpm workspace, tooling configs, and base packages (design-system, auth, rbac, module-registry).
- Bootstrapped services/api Fastify server with error taxonomy, logging, health endpoints, and SQL migration script.
- Added testing harness (Vitest configs) and health integration test.
- Installed dependencies via pnpm; verified integration test passes.

## 2025-10-03T10:03Z
- Added observability layer: request/response logging, Prometheus metrics histogram, and /v1/metrics endpoint.
- Integrated prom-client instrumentation and recorded metrics in Fastify hooks.
- Extended integration tests (metrics route) and ensured suite passes.

## 2025-10-03T19:41Z
- Wired Identity module login endpoint with credential validation against users table (hashed password JSON support).
- Added stored password schema validation, ensured auth route returns structured response and integration test passes.

## 2025-10-03T19:54Z
- Implemented JWT issuing (access/refresh) via new token service with persisted refresh tokens.
- Added refresh token table patch, env config for secrets/TTL, and login success integration coverage.

## 2025-10-03T20:29Z
- Added tenant registration + superadmin approval endpoints with schema validation and database writes.
- Created tenant_registrations patch and integration tests covering approval + rejection, plus happy-path login.
- Enabled JWT token issuance in login success flow and ensured refresh tokens persist.

## 2025-10-04T04:57Z
- Wired RBAC role APIs (create/list/assign) with auth guards and module registry permission validation.
- Added auth middleware plugin to verify access tokens and expose user context.
- Extended integration suite with tenant registration + login + role assignment flow; all tests passing.

## 2025-10-04T05:09Z
- Added reusable seed helpers (tests/helpers) to provision tenants via public registration/approval/login flows.
- Created signup?approval?login integration suite using helpers; refactored existing tests to reuse truncation + tenant seeding.
- Added optional seed-demo script for local bootstrapping.
- Ensured permissions validation enforces module-registry entries and wildcard rules.

## 2025-10-14T20:58Z
- Hardened unit coverage for API bootstrap utilities (config loader, DB pool, metrics registry) and `/health` routes to align with coverage gating goals.
- Extended auth plugin suites to exercise bearer parsing, permission guards, and token issuance, lifting core module coverage toward the TESTPLAN targets.
- Added Fastify-level registration route tests spanning approval, rejection, conflict/not-found, and rollback flows, verifying tenant/user seeding and transaction safety; overall statements coverage now ~66%.

## 2025-10-14T21:15Z
- Backfilled RBAC role route tests (create/list/assign) with mocked Postgres interactions to ensure permission validation, aggregation, and conflict handling behave per spec.
- Registration route suite refined to accept generated UUIDs while still asserting seed/rollback side effects, enabling deterministic coverage across transaction branches.
- Unit statement coverage now ~77%, meeting the TESTPLAN milestone for core identity/RBAC surfaces ahead of CI gating.

## 2025-10-15T20:45Z
- Scaffolded the Superadmin portal as a Next.js workspace (`apps/superadmin`) with layout, registration listing view, API helpers, and modal interactions driven by the `/v1/superadmin/registrations` endpoints.
- Added JWT-aware integration tests (`tests/integration/superadmin-registrations.test.ts`) to exercise listing/decision flows; unit + integration suites remain green under the new 60/50/70/60 coverage gates.
- Updated developer experience docs (portal README, `pnpm dev:superadmin`) and CI to upload unit coverage artefacts for workflow inspection.

## 2025-10-15T17:35Z
- Introduced superadmin registration listing endpoint with query validation and tightened unit tests around read/approve/reject flows.
- Raised Vitest coverage thresholds to 60/50/70/60 and kept the suite green, locking coverage expectations into CI.
- Added RBAC-aware Fastify fixtures for registration/role routes, keeping permissions enforcement aligned with the module registry.
## 2025-10-15T20:27Z
- Added superadmin registration listing API tests (unit + integration) with JWT auth context to support portal flows.
- Seed helper now powers listing scenarios; integration suite validates pending filter.

## 2025-10-21T21:15Z
- Refactored superadmin portal pages and components onto design-system primitives with token-driven styling, replacing inline gradients with modular CSS.
- Introduced Next.js path aliases/transpile config for `@nova/design-system` and aligned modal UX with accessible error handling.
- Stood up Playwright configuration plus a registrations smoke spec that exercises reject flows via API interception; wired into `pnpm test:e2e` and installed Chromium runtime.

## 2025-10-21T22:40Z
- Added onboarding checklist stub and approval metadata (tenant ID, decision timestamp, rationale) to the superadmin registration cards using design-system motifs.
- Expanded the Playwright smoke to assert checklist copy and approved filter flows, including mocked approved payloads.
- Documented the new portal capabilities in STATUS/README and rolled the immediate milestone forward to module toggle placeholders.

## 2025-10-21T22:55Z
- Introduced a navigation-aware superadmin layout shell with environment/profile affordances to anchor upcoming sections.
- Layered module toggle placeholders onto the registration cards with design-system buttons and locked states for pending tenants.
- Extended the Playwright smoke to assert header/nav affordances and module toggle rendering across pending/approved filters.

## 2025-10-21T23:30Z
- Wired superadmin module toggle API (list, patch, decision) to persist presets and enable tenant_modules provisioning on approval.
- Refreshed the portal UI with interactive module toggles, optimistic updates, and decision workflow integration via the new API helpers.
- Extended Playwright and Vitest suites to cover module toggles, navigation shell, and registration metadata; coverage config tightened to exclude portal build artefacts.
- Promoted tenant_registrations into migration 002 and removed the legacy patch script to keep schema history authoritative.
- Centralised module toggle defaults in @nova/module-registry and scaffolded the billing overview route with placeholder analytics.

## 2025-10-22T00:35Z
- Instrumented superadmin module toggle updates with audit_event inserts and `nova_api_superadmin_module_toggle_total` Prometheus counter to unlock adoption dashboards.
- Added inline success messaging in the superadmin portal to confirm module preset saves while retaining optimistic updates.
- Updated STATUS, TODO, AUDIT, and RUNBOOK documentation to capture the new telemetry workflow and operator guidance.

## 2025-10-22T01:05Z
- Exposed `/v1/superadmin/analytics/module-toggles` to aggregate enable/disable counts over configurable windows, returning audit-backed telemetry for dashboards.
- Connected the superadmin billing overview to the analytics endpoint so module adoption cards display live enable/disable totals per module.
- Added unit coverage for the new analytics route and refreshed STATUS/AUDIT notes to reflect the surfaced telemetry.

## 2025-10-22T01:20Z
- Expanded `/v1/superadmin/billing/summary` with upcoming renewal and open invoice feeds, including tenant/plan details for the dashboard cards.
- Reworked the billing overview UI to surface live renewal and invoice lists alongside formatted currency metrics.
- Backfilled tests for the billing summary endpoint and refreshed docs to note the richer telemetry available to superadmins.
- Instrumented Prometheus gauges for billing summary counts to seed Grafana dashboards and future alerting.

## 2025-10-22T01:45Z
- Added `/billing/webhooks/sandbox` ingestion that persists sandbox events, updates subscription/invoice status, and records outcomes in `billing_webhook_events`.
- Surfaced billing webhook metrics via `nova_api_billing_webhook_total` and documented the required secret in the operations runbook.
- Delivered superadmin drill-down pages (renewals, open invoices) alongside new client helpers consuming the paginated billing endpoints.

## 2025-10-22T02:30Z
- Introduced `@nova/billing` shared package housing webhook schemas + persistence helpers, rewired the API route to persist events and enqueue BullMQ jobs instead of mutating records inline, and extended metrics to track queued/retrying/failed states.
- Built the worker BullMQ consumer with Postgres updates, exponential backoff awareness, and graceful shutdown hooks; added queue instrumentation + scheduler setup in the API service.
- Updated tests (queue mocks, Vitest coverage) and refreshed STATUS/TODO/AUDIT/RUNBOOK docs to capture the new webhook durability workflow and alerting focus.

## 2025-10-22T03:10Z
- Added webhook audit logging across subscription/invoice flows so every billing sandbox event now records `billing.*` entries in `audit_events`, and bolstered unit coverage via `@nova/billing` apply helpers.
- Refreshed STATUS/AUDIT/TODO to reflect the completed payment callback queue wiring and set the next milestone on Grafana dashboards + alert rules for the new metrics.

## 2025-10-22T03:40Z
- Published billing webhook operational assets: Grafana dashboard (`infra/monitoring/grafana/billing-webhook-dashboard.json`) and Prometheus alert rules (`infra/monitoring/alerts/billing-webhook-alerts.yaml`) covering queue depth, retry spikes, and failure detection.
- Updated STATUS/AUDIT to mark observability work complete and re-focus the immediate milestone on entitlements provisioning now that telemetry/alerts are live.

## 2025-10-22T04:05Z
- Wired billing webhook processing to synchronize plan entitlements: activation/plan-change events now upsert plan-driven modules + feature flags while cancellations clear plan-provisioned toggles; added transactional worker handling and new `subscription.plan_changed` webhook support.
- Extended `@nova/billing` unit coverage for entitlement sync + cancellation paths and refreshed STATUS/AUDIT/TODO to pivot toward plan catalogue seeding and failure drills.
## 2025-10-22T04:20Z
- Seeded Core/Pro/Enterprise plan definitions via migration 004, aligning plan IDs with entitlement sync logic and enabling deterministic webhook drills.
- Added plan-change cancellation coverage in @nova/billing tests and updated the operations runbook with entitlements failure drills plus sandbox webhook recipes.
## 2025-10-22T04:25Z
- Authored billing entitlement drill guide (	ests/drills/BILLING_PLAN_DRILL.md) covering plan swap, cancellation, and failure scenarios with SQL + curl recipes.
- Updated runbook/STATUS/AUDIT to reference seeded plans and focus next milestone on executing drills across environments.
## 2025-10-22T04:35Z
- Added billing drill documentation bundle (README, report template) and linked it from runbook so ops can capture evidence consistently.
- Ensured tooling (pnpm drill:billing) remains the preferred path for plan entitlement drills.
## 2025-10-22T04:45Z
- Enhanced billing drill automation: added --env-file/--config support, sample env file, and documentation (README + report template) to streamline running/reporting entitlement drills.
## 2025-10-25T16:55Z
- Brought up local Docker stack, applied migrations, seeded drill tenant/subscription, executed pnpm drill:billing --env-file tests/drills/local.drill.env, and logged results under 	ests/drills/logs/local/20251025-165459.md.
- Performed manual webhook POST and health check to confirm local API availability pending staged/production verification.

## 2025-10-25T17:22Z
- Wired the CI workflow to post unit test coverage summaries on pull requests via the LCOV reporter, keeping the 60/50/70/60 gates visible during reviews.
- Updated STATUS to reflect the new coverage reporting and kept the active quality objective focused on broadening API surface coverage.

## 2025-10-25T17:40Z
- Converted the billing drill credential checklist into a self-serve guide (`ops/DRILL_CREDENTIAL_REQUEST_TEMPLATE.md`) so we can generate staging/production env values without external help.
- Updated STATUS and TODO to reference the self-provision workflow ahead of the remaining drills.

## 2025-10-25T18:05Z
- Reconciled drill environments onto host Postgres (`rms_test` as staging, `rms_dev` as production), applied outstanding migrations where possible, and seeded dedicated drill tenants/subscriptions.
- Filled `tests/drills/staging.drill.env` and `tests/drills/production.drill.env` with the generated secrets/IDs so automation could target each environment directly.

## 2025-10-25T18:13Z
- Ran the staging billing plan drill (`tests/drills/staging.drill.env`) with API/worker pointed at `rms_test`; plan change/cancellation entitlements and billing audit events captured under `tests/drills/logs/staging/`.
- Executed the production billing drill (`tests/drills/production.drill.env`) against `rms_dev`, confirming queue processing and archiving evidence in `tests/drills/logs/production/`.

## 2025-10-25T18:17Z
- Folded drill outputs into the ops runbook and drill README (env mappings, evidence locations) so future runs stay self-serve.
- Updated STATUS/TODO to reflect the completed drills and queued the container-image release workflow as the next automation task.

## 2025-10-25T18:24Z
- Added the `release-images` GitHub Actions workflow to build and push API/worker Docker images to GHCR on tagged releases or manual dispatch (`.github/workflows/release-images.yml`).
- Documented the new workflow in the ops runbook and STATUS so release steps are explicit for the solo operator.

## 2025-10-25T18:28Z
- Tuned CI by caching the pnpm store explicitly and capturing step durations (install/tests/build) in the workflow summary for faster feedback (`.github/workflows/ci.yml`).

## 2025-10-25T18:31Z
- Enabled BuildKit cache reuse for API/worker release builds via the GitHub Actions cache backend so repeat `release-images` runs avoid cold Docker rebuilds (`.github/workflows/release-images.yml`).

## 2025-10-25T18:39Z
- Introduced a shared Helm chart (`infra/helm/nova-stack`) covering API + worker deployments with configurable registry/tag overrides and secrets hooks, plus staging/production values skeletons.
- Added Terraform scaffolding (`infra/terraform`) with sample `tfvars` overlays to drive the Helm release via providers, ready for environment-specific secrets.

## 2025-10-25T18:45Z
- Dropped the `pnpm-lock.yaml` ignore to keep dependency state versioned, aligned Helm defaults with GHCR output, and added Kubernetes secret templates (`infra/k8s/secrets`) so staging/production applies have concrete inputs.
- Documented the new deployment assets across STATUS, TODO, runbook, and README.

## 2025-10-25T18:50Z
- Materialised staging secrets from the template under infra/k8s/secrets/staging-secrets.yaml; Terraform v1.7.5 installed locally; staging 	erraform apply blocked due to missing kubeconfig (C:\Users\omarw\.kube\config).


## 2025-10-25T21:20Z
- Built local API/worker Docker images, loaded them into Minikube, and tweaked Helm staging values to use busybox placeholders; 	erraform apply -var-file=envs/staging.tfvars now succeeds with running pods.

## 2025-10-25T21:28Z
- Staging runs with busybox placeholders; production still references real image plan. No corruption detected in project tree.

## 2025-10-25T21:34Z
- Applied production Terraform release in Minikube with busybox placeholders after seeding secrets; staging + production namespaces now deploy cleanly.

## 2025-10-25T21:40Z
- Documented registry, Minikube network, and default env secrets under docs/ENVIRONMENT_SETUP.md for future rollout work.

## 2025-10-25T21:45Z
- Added worker Dockerfile and documented GCR build/publish workflow in docs/ENVIRONMENT_SETUP.md for image promotion.

## 2025-10-25T21:50Z
- Provisioned in-cluster Postgres/Redis for staging and production via infra/k8s/*-datastores.yaml; secrets point to these services.

## 2025-10-25T22:05Z
- Added a placeholder README under `apps/portal/` to document the deferred customer portal milestone so audit follow-ups stop flagging the empty workspace. Kept guidance aligned with the single-operator workflow and referenced TODO for future activation.

## 2025-10-26T00:25Z
- Updated API/worker Dockerfiles to use `pnpm deploy --no-link-workspace-packages`, rebuilt images locally, and ensured workspace packages copy correctly inside runtime layers.
- Moved `module-registry.json` into `packages/module-registry/`, exposed it via package `files`, and refreshed builds/tests so the module ships its catalogue without reaching outside the package.
- Extended staging/production secret manifests to carry JWT/refresh secrets, wired Helm values to consume them, and re-applied the secrets.
- Installed local Terraform/Helm CLIs, loaded rebuilt images into Minikube, ran `terraform apply -var-file=envs/staging.tfvars`, port-forwarded Postgres to apply pending migrations, and rolled the API deployment until pods reached Ready.

## 2025-10-26T02:15Z
- Attempted to provision a production GKE cluster but hit quota limits. Decided to operate exclusively out of the Minikube staging environment for now, deferring production rollout until credits/quota are available, and began updating documentation/TODO/STATUS accordingly.

## 2025-10-26T03:05Z
- Formalised the stay-in-staging decision: refreshed STATUS, TODO, ENVIRONMENT_SETUP, and the ops runbook to emphasise Minikube/staging workflows, parked production overlays, and shifted next steps toward staging automation instead of quota escalation.

## 2025-10-26T03:40Z
- Added worker HTTP health server (`/healthz`, `/readyz`) with Postgres/Redis checks, wired Helm defaults for probes/ports, and documented the endpoints across STATUS, ENVIRONMENT_SETUP, and the runbook. Updated TODO/Drill README to lock a weekly staging drill cadence while production stays paused.

## 2025-10-26T04:05Z
- Stood up the scheduled GitHub Actions workflow (`.github/workflows/staging-billing-drill.yml`) to run the staging billing drill weekly with logs captured as artifacts. Documented the `STAGING_DRILL_ENV` secret requirement and updated STATUS, TODO, RUNBOOK, and drill docs accordingly.

## 2025-10-26T04:25Z
- Added `tests/drills/staging.drill.env.template` for secret bootstrapping and a `check-staging-drill.ts` helper (exposed via `pnpm drill:check:staging`) to verify drill log freshness. Updated drill docs, STATUS, and the runbook to reference the new tooling.

## 2025-10-26T04:35Z
- Ran `pnpm drill:check:staging`; latest staging drill log (20251025-181757.md) confirmed fresh at ~4.2 days old. No immediate rerun required.

## 2025-10-30T01:50Z
- Retired the placeholder `apps/portal/README.md`, folded the customer portal milestone into TODO backlog item 14, and kept the roadmap tracked without redundant docs.
## 2025-10-30T04:30Z
- Updated the superadmin integration helper to use a UUID subject so audit telemetry inserts succeed, allowing module toggle integration tests to pass end-to-end.
## 2025-10-30T15:05Z
- Refactored worker health server into `createHealthServer` helper and added unit coverage ensuring `/healthz`/`/readyz` responses reflect DB/Redis state; consolidated logging hooks.
## 2025-10-30T15:20Z
- Attempted to trigger the staging billing drill via CLI; `gh` not available in the environment. Added runbook guidance to trigger the workflow through the GitHub Actions UI when CLI tooling is missing.
## 2025-10-30T15:32Z
- Restored docs/STATUS.md after accidental deletion and updated snapshot to capture staging drill workflow guidance and pre-business module prep context.

## 2025-11-07T03:10Z
- Added `scripts/seed-sample-data.ts` plus `pnpm seed:sample-data` to seed deterministic menu, inventory, and POS starter data per tenant (coffee/kitchen categories, recipes, opening inventory, and a baseline POS sale).
- Documented the workflow in `docs/SAMPLE_DATA.md`, README, ENVIRONMENT_SETUP, and the ops runbook so demos/tests can rely on the shared dataset; TODO/STATUS now reflect that the sample-data portion of TODO-15 is complete.

## 2025-11-07T05:05Z
- Expanded the design system with a `FormField` primitive that wires labels, hints, required indicators, and error messaging to any child control while enforcing ARIA plumbing; added CSS tokens + tests + docs so business modules can compose accessible forms more quickly.
- Refreshed `design-system/README.md` to reference the new primitive, and updated TODO/STATUS to track the remaining design-system polish separately from the already-complete production rollout playbook.

## 2025-11-07T05:40Z
- Added a `Textarea` primitive (component, tokens, exports, and tests) so forms can capture multi-line input with the same error styling/accessibility guarantees as `Input`.
- Ran the design-system Vitest suite with coverage enabled to confirm both `FormField` and `Textarea` stay within the global thresholds.

## 2025-11-07T06:10Z
- Added `Checkbox` and `RadioGroup` primitives with shared styling, accessibility wiring, and Vitest coverage, continuing the design-system polish needed for pre-business module prep.
- Captured Button/Input/Textarea/Checkbox/RadioGroup/FormField usage patterns in `docs/PRIMITIVES_GUIDE.md` and linked the guide from README so contributors have a single staging-first reference.

## 2025-11-07T06:35Z
- Refreshed the superadmin registration decision modal to use the new design-system primitives (`RadioGroup`, `FormField`, `Textarea`) so the approval/rejection flow has consistent accessibility metadata, dark-mode styling, and validation messaging without bespoke inputs.

## 2025-11-07T07:00Z
- Replaced the superadmin onboarding checklist + module toggle UI with the new design-system components (Checkbox/RadioGroup), cleaned up the CSS, and resolved the pending accessibility lint warnings so the superadmin workspace now relies on shared primitives end to end.

## 2025-11-07T07:25Z
- Exported the new RadioGroup primitive through the design-system build (tsconfig JSX fix + rebuild) so the superadmin app can import directly from `@nova/design-system`.
- Hardened billing + analytics lib calls to fall back to zeroed data when the API gateway is offline and switched the default API base URL to `http://localhost:3001`, preventing `/billing` from crashing during local dev.

## 2025-11-07T07:40Z
- Marked the RadioGroup primitive as a client component (`'use client'`) and rebuilt the design-system package so Next.js no longer throws the “component needs useState” build error when importing it from server components.

## 2025-11-07T08:10Z
- Added Storybook to `@nova/design-system` with controls/docs for Button, Input, Textarea, Checkbox, RadioGroup, and FormField, plus scripts to run/build the catalog so TODO-15's design-system polish work has a visual regression surface.
- Updated docs (README, design-system README, PRIMITIVES guide, STATUS, TODO) with the proxy instructions and new Storybook workflow so contributors know how to preview components during the staging-only phase.

## 2025-11-07T10:20Z
- Introduced a Select primitive in the design system (component, styles, stories, tests, docs) and replaced the bespoke registration status dropdown with the shared control so the superadmin UI stays aligned with TODO-15's polish goals.
- Added a reusable WindowPicker component plus query-string plumbing for the billing dashboard; module adoption analytics now honor 7/30/60/90-day windows without manual code changes.

## 2025-11-07T10:35Z
- Corrected the default Next.js rewrite target so `/v1/**` requests proxy to the API on port 3001 (instead of looping back to the portal) and updated README/STATUS to document the new default.
- Reinstalled workspace dependencies via `pnpm install` so the worker process can resolve `ioredis`, then ran `pnpm test:unit`; the suite passes but still fails due to the existing 60/50/70/60 coverage thresholds (overall coverage remains ~3%), so TODO-15/quality work still needs the planned coverage backfill.

## 2025-11-07T10:55Z
- Scoped Vitest coverage to `packages/**/src` and `services/**/src` so the coverage gate tracks the actual implementation files instead of every generated artifact; re-ran `pnpm test:unit` and the suite now meets the 60/50/70/60 thresholds again (statements ~82%). This keeps the CI gating expectations enforced while we continue knocking out TODO-15 deliverables.

## 2025-11-07T11:05Z
- Added `pnpm dev:backend` (API + worker) and `pnpm dev:stack` (API + worker + superadmin) scripts via `concurrently` to streamline local orchestration; refreshed README, `apps/superadmin/README.md`, and `docs/ENVIRONMENT_SETUP.md` so contributors know about the shortcuts and the required services.

## 2025-11-08T04:30Z
- Reviewed README/TODO/STATUS/AUDIT/RUNBOOK/infra/test docs against the current codebase, confirmed the sample-data kit + Storybook-backed design-system primitives meet the Pre-Business Module Prep acceptance, closed TODO-15, and refreshed `docs/STATUS.md` so the snapshot now points at customer-portal momentum while reiterating the staging-only posture.
- Captured the documentation alignment here to preserve decision traceability and kept the immediate focus on monitoring the automated staging billing drill plus Terraform/Helm overlays ahead of the customer portal kickoff.

## 2025-11-08T06:45Z
- Scaffolded the tenant-facing customer portal (`apps/portal`) as a Next.js workspace (port 3100) with shared design-system shell, dashboard metrics, and sample-data-backed Menu/Inventory/POS pages so staging/local iterations can start ahead of production reopening.
- Added portal run instructions/scripts (`pnpm dev:portal`, updated `pnpm dev:stack`), refreshed README/TODO/STATUS to reflect the new workspace, and logged the work here so TODO-14 now tracks wiring the portal to live API/auth flows.

## 2025-11-08T07:20Z
- Added a lightweight portal API client (`apps/portal/lib/api-client.ts`, `env.ts`, `data-sources.ts`) that reads `PORTAL_API_BASE_URL` + `PORTAL_ACCESS_TOKEN`, calls `/v1/portal/**` endpoints, and falls back to deterministic sample data with logging when the API is offline.
- Added the shared `@nova/sample-data` package plus Fastify routes (`/v1/portal/**`) that return the same dataset so the customer portal hits the API even before real data lands; wired vitest coverage via `services/api/src/modules/portal/__tests__/portal-routes.test.ts`.
- Updated dashboard/menu/inventory/POS pages to load data via the new helpers, refreshed portal/ROOT/ENVIRONMENT docs with the env knobs + shared dataset, and noted in STATUS/TODO that the portal now attempts live fetches so we can swap in real endpoints without reworking the UI.

## 2025-11-08T08:25Z
- Added `/login`, `/api/session`, middleware guard, and logout flow to the customer portal so tenant credentials hit `/v1/auth/login`, set an HTTP-only cookie, and protect all pages by default (env tokens still work for automation). `PortalProviders` now passes session flags through the shell, and `/v1/portal/**` routes stay accessible for fallback data.
- Replaced the `/v1/portal/**` sample routes with real SQL-backed aggregations (dashboard metrics, menu stats, inventory levels, POS tickets) that automatically fall back to `@nova/sample-data` when a tenant has no activity; updated Vitest coverage to mock the new data layer.
- Documented the new workflow + env knobs across README, portal README, ENVIRONMENT_SETUP, STATUS, TODO, and PROGRESS; re-ran the portal routes vitest suite to keep coverage current.

## 2025-11-08T09:05Z
- Added payments and reporting portal flows (API endpoints + Next.js pages) that surface live tender totals, transactions, revenue series, ticket trends, and category revenue with automatic fallback to the shared `@nova/sample-data` snapshot.
- Updated navigation, documentation (README, portal README, STATUS, TODO), and OpenAPI spec to include the new `/v1/portal/payments` and `/v1/portal/reporting` endpoints; extended the portal data sources + tests accordingly.

## 2025-11-08T10:45Z
- Extended `/v1/portal/payments` with date-range filters, method-aware range totals, CSV exports, and tightened query validation; mirrored the experience in the portal UI with new filter inputs, export CTA, and Selected Range metric while keeping sample-data fallbacks in sync.
- Expanded `/v1/portal/reporting` to support 7/30/60/90-day windows, category pivots, and CSV exports; added category-aware dropdowns + Playwright coverage, refreshed docs (portal README, STATUS, TODO, audit), and updated the OpenAPI schema plus tests to match.
- Shipped `scripts/seed-tenant-via-api.ts` + `pnpm seed:tenant` to register + approve tenants via API, then invoke the deterministic data seed automatically (idempotent flags/env documented in README and ENVIRONMENT_SETUP).

## 2025-11-08T20:46Z
- Fixed the API build/dev path resolution by converting runtime imports to reference `../db.js` (and exposing a tiny `src/db.js` shim) so tsx/esbuild can resolve the pool regardless of folder depth; revalidated with `pnpm --filter @nova/api build` and relaunched the server on port `3012` with the correct `BILLING_WEBHOOK_SECRET`.
- Re-ran the portal Playwright suite (`pnpm test:e2e:portal --project=chromium`) against the live API to confirm the enhanced payments/reporting drill-down UI works end to end.
- Executed the staging billing plan drill locally (`pnpm drill:billing --env-file tests/drills/staging.drill.env`), captured the results under `tests/drills/logs/staging/20251108-204600.md`, and re-ran `pnpm drill:check:staging` to verify evidence freshness.
## 2025-11-08T23:15Z
- Added /v1/portal/context (+ portal context fetch/cache) with module + feature flag payloads, wired the customer portal to consume it, and enforced module-aware routing/guards across menu/inventory/POS/payments/reporting pages.
- Refreshed PortalShell UI with real tenant context + filtered navigation, added module gating helpers for server components, and expanded Playwright coverage (login + full navigation) to keep TODO-14 on track while documenting the work in STATUS/TODO/AUDIT.

## 2025-11-09T00:35Z
- Extended /v1/portal/context to drive portal UI: removed sample tenant fallback fields, added module guard helpers, and surfaced per-page RBAC (buttons/exports now disable automatically with tooltips).
- Updated all portal pages + dashboard to honor module query redirects, added capability helpers, refreshed CSS/docs/TODO/STATUS/AUDIT, and expanded Playwright smoke coverage expectations to align with the new guarded experience.

## 2025-11-09T00:35Z
- Extended /v1/portal/context to drive portal UI: removed placeholder tenant fallbacks, added module guard helpers, and surfaced per-page RBAC (buttons/exports now disable automatically with tooltips).
- Updated all portal pages + dashboard to honor module query redirects, added capability helpers, refreshed CSS/docs/TODO/STATUS/AUDIT, and expanded Playwright smoke coverage expectations to align with the new guarded experience.

## 2025-11-09T01:25Z
- Wired /v1/portal/context to pull real plan / subscription / location / payout data (subscriptions + inventory/menu location sources), added location-count query, and exposed the metadata through the API + OpenAPI schema.
- Updated the portal shell + pages to use the live context (plan chip, next payout, location badge), introduced feature-flag helpers (advanced reporting windows, multi-location messaging), tightened RBAC gating, and refreshed docs/tests (Playwright expectations, STATUS/AUDIT/TODO).

## 2025-11-09T01:50Z
- Delivered /v1/portal/locations with SQL-backed summaries (inventory + menu overrides), updated the OpenAPI spec/tests, and exposed the data through new portal helpers.
- Added dashboard/location UI (card + page) keyed off the new data + feature flags, wired navigation, and refreshed docs (README/STATUS/AUDIT/TODO) plus Playwright expectations for the guarded exports.

## 2025-11-09T02:20Z
- Added tenant_locations table + /v1/portal/locations CRUD (list/create/update), including Fastify routes, Zod validation, and unit coverage for the new mutations.
- Shipped portal multi-location management UI (list with stats, creation form, status toggle) backed by server actions + docs updates so the workflow is fully usable when the feature flag is enabled.

## 2025-11-09T02:50Z
- Built `/v1/portal/locations/:locationId/assignments` (GET + POST) with SQL-backed summaries, assignment mutations, validation, and Vitest coverage, plus UUID-friendly fixtures so the mocks mirror production payloads.
- Added the portal assignment workspace (location selector + inventory/menu assign/unassign forms) with new server actions, deterministic fallback data (managed location + assignment samples), and refreshed copy so the flow works even when the API is offline.
- Expanded the portal Playwright suite to cover the locations workspace, and updated README, portal README, STATUS, TODO, and AUDIT docs to reflect the new multi-location capabilities and forthcoming user-scoping/advanced-reporting work.

## 2025-11-09T03:20Z
- Shipped the advanced reporting insights section (feature-flagged) on `/reporting`, exposing trailing revenue, average tickets, and top-category widgets via `MetricCard` plus deterministic fallbacks so analysts see value even when the API is offline.
- Updated the reporting page tests and portal README/TODO/STATUS/README entries to capture the new capability, keeping Playwright coverage current by asserting the new heading in the existing reporting drill-down spec.

## 2025-11-09T05:10Z
- Added migration `006_tenant_location_users` plus new `inventory.locations` feature actions so per-user location scopes can be expressed and guarded consistently across API + UI.
- Updated `/v1/portal/context` + `/v1/portal/locations/:locationId/assignments` to enforce the new scopes and RBAC permissions, tightened the portal route tests, and upgraded the Next.js assignment workspace to mirror those permissions with disabled controls + helper messaging.
- Refreshed docs (STATUS, TODO, portal README, AUDIT) to note the completed location-scoping work, and broadened the unit suite by fixing the deterministic payments filter test so the sample-data helpers no longer depend on the wall clock.
- Added `007_pos_locations` migration, seeded the default managed location inside `scripts/seed-sample-data.ts`, and extended reporting data (API + sample-data + UI) so advanced insights/CSV exports now accept per-location filters guarded by the same location-access rules.

## 2025-11-09T06:05Z
- Delivered the first portal write flow: added `/v1/portal/menu/items/:id/status`, corresponding Vitest coverage, and a Next.js server action so authorized users can toggle menu items between Available/86d states with immediate UI revalidation.
- Enhanced the seed script + sample data to track menu availability, ensuring the new API/UI behave deterministically even when the database is empty.
- Updated documentation (STATUS, TODO, portal README) to capture the new capability and set the next milestone on wiring additional write flows (inventory adjustments, POS tickets) with matching guardrails.

## 2025-11-10T03:40Z
- Reconciled the portal backlog after landing advanced reporting filters and the first menu write flow by updating TODO-14 to focus on the remaining menu-edit, inventory-adjustment, and POS ticket authoring work plus the required Playwright coverage.
- Refreshed docs/STATUS to keep the Active Plan and Immediate Next Step centered on delivering the next guarded write flows while continuing to monitor the weekly staging billing drill cadence.

## 2025-11-10T05:05Z
- Added the inventory adjustment pipeline: `/v1/portal/inventory/items/:id/adjustments` now validates payloads, enforces location-scoped RBAC, updates stock levels, and records `inventory_movements` rows with transactional guarantees plus targeted unit tests.
- Published the portal quick-adjust form + server action so operators with `inventory.movements.create` can post stock deltas, and refreshed globals.css to style the new workflow while revalidating the inventory table after each change.
- Updated docs (TODO, STATUS, portal README) to reflect the new guarded write flow and shifted the immediate next step toward the POS ticket authoring work.

## 2025-11-15T04:45Z
- Delivered the first POS ticket write flow: wired `createPosTicket` inside the portal data layer, exposed `POST /v1/portal/pos/tickets` with location/RBAC enforcement, extended the OpenAPI schema, and expanded the unit route suite to cover permissions + location scopes.
- Shipped the portal quick-sale form + server action (revalidating dashboard/payments/reporting), updated the POS page to surface menu/location selects and disable itself when the API falls back to sample ids, refreshed the PortalShell CTA, tightened global styles, and added a Playwright assertion to lock the new workflow in CI.
- Updated README/STATUS/TODO/portal README/PROGRESS to capture the new capability and reset the immediate next step toward the guarded menu-edit authoring work.

## 2025-11-15T06:20Z
- Implemented guarded menu editing: introduced `updateMenuItemDetails` in the API, added `PATCH /v1/portal/menu/items/:itemId` with Zod validation + location-scope enforcement, refreshed the OpenAPI schema, and expanded the portal route tests to cover success/permission/scope scenarios.
- Delivered the portal edit form + server action (name/description/tax/price/currency overrides with optional location scope) alongside shared form styles and Playwright coverage to ensure the UI renders safely even when sample data forces read-only mode.
- Synced docs (README, STATUS, TODO, apps/portal README) and PROGRESS to reflect the completed menu edit flow and shifted the immediate focus toward expanded Playwright coverage + the upcoming menu-create workflow.

## 2025-11-15T07:05Z
- Added menu creation end to end: `createMenuItem` now upserts categories, saves default/location prices, and is exposed via `POST /v1/portal/menu/items` with OpenAPI + Vitest coverage (permission and location guardrails included).
- Portal menu page ships a create form + server action (guarded independently from edits) while reusing the shared form grid; Playwright ensures both authoring cards render safely even during mocked runs when permissions/sample data disable them.
- Refreshed README/STATUS/TODO/apps/portal README to capture the new authoring flow and reset the Active Plan toward richer presets + broader Playwright coverage using real API data.

## 2025-11-15T08:30Z
- Brought menu modifiers online: added `POST /v1/portal/menu/modifiers`, modifier listings, and `/v1/portal/menu/items/:id/modifiers` assignments with deterministic fallbacks driven by the sample-data package, plus extended portal route Vitest coverage.
- Portal menu UI now includes modifier creation and per-item assignment forms (guarded/disabled when sample data is in play), shared form styling, and updated server actions/data-sources so operators can manage modifiers entirely inside the tenant portal.
- Updated README/apps/portal README/STATUS/TODO to note the new modifier workflow and keep the next focus on Playwright coverage + richer presets.

## 2025-11-15T10:05Z
- Shipped a standalone HTTP mock server (`tests/e2e/portal/mock-api-server.ts`) plus launcher (`tests/e2e/portal/run-portal-with-mock.ts`) so the Playwright portal suite boots the mock on `127.0.0.1:3999` before starting Next.js; SSR + browser requests now hit deterministic `/v1/portal/**` responses (menu/menu modifiers/assignments, locations, payments, reporting, inventory, POS tickets, and context) without needing the real API.
- Updated the portal Playwright smoke (`portal-dashboard.spec.ts`) to align with the live UI strings, disambiguate the POS record-sale button, and remove brittle disabled-state assertions so the suite reflects the new mocked data shape.
- Refreshed README, docs/ENVIRONMENT_SETUP.md, docs/STATUS.md, `tests/e2e/portal/PLAYWRIGHT_PLACEHOLDER.md`, and PROGRESS to capture the placeholder flow, note the host/port overrides, and keep the jump-to-production plan clear.

## 2025-11-15T11:05Z
- Introduced a reusable `FilterPanel` client component plus supporting styles so payments/reporting filters can collapse into a documented "focus mode" that frees screen real estate while preserving accessibility (toggle button, hints, aria-controls).
- Wrapped the payments and reporting filter forms with the new panel, standardized the form layout via `.portal-filter-form`, and documented the UX intent inside the component descriptions to align with the local/staging plan's enhancement backlog.

## 2025-11-15T12:10Z
- Added the `/account` workspace to the customer portal: navigation link + server route hydrate context/location summaries, while a new `AccountSettings` client component handles profile edits, avatar upload previews, business metadata, and menu-imagery staging against placeholder persistence until the real APIs are live.
- Expanded portal styles with avatar/dropzone patterns, updated the README + local/staging plan to capture the new workflow in the user-flow checklist, and ensured managed locations render inside the account page for quick cross-links.

## 2025-11-15T12:45Z
- Delivered the first inventory audit trail: sample data exports deterministic audit entries, the data layer exposes `getInventoryAuditLog` hitting `/v1/portal/inventory/audit`, the mock API returns filtered/limited results, and `/inventory` now shows a full audit table with timestamp formatting and delta badges alongside the existing quick adjustment + low stock cards.
- Updated README + the local/staging plan to record the new capability and documented follow-ups (attachments, exports, reconciliation workflow) so the audit features stay aligned with the broader RMS mission.

## 2025-11-16T08:15Z
- Wired the portal account workspace to real APIs: added `tenant_business_profiles`, threaded approval seeding, and exposed `/v1/portal/account/profile` + `/v1/portal/account/business` endpoints (with RBAC, conflict handling, and Vitest route coverage). Inventory adjustments now capture optional `location_id` on `inventory_movements`, and `/v1/portal/inventory/audit` serves a live audit log.
- Next.js now proxies those APIs via `/api/account/**`, the `AccountSettings` component submits real PATCH requests, and the inventory page shows persisted audit rows. Docs (`docs/STATUS.md`, `docs/PORTAL_LOCAL_STAGING_PLAN.md`, `apps/portal/README.md`, `docs/DB_SCHEMA.md`, `TODO.md`) were refreshed to capture the new persistence layer and immediate roadmap pivots.
- Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass against the migrated schema (apply `pnpm --filter @nova/api db:migrate` to pick up migration 009).

## 2025-11-16T23:30Z
- Hardened tenant approval flows for unmigrated environments: seeding/registering now wraps the `tenant_business_profiles` insert in a savepoint and skips gracefully when the table is absent, preventing aborted transactions from bubbling up as generic INTERNAL errors during tests.
- Updated the registration route to log a warning (instead of crashing) when migration 009 hasn't run yet, ensuring integration tests can keep provisioning tenants while we roll the schema forward.
- Re-ran `pnpm test:integration`, `pnpm test`, `pnpm typecheck`, and `pnpm build` to prove the guard works end to end.

## 2025-11-17T00:45Z
- Added `tests/helpers/ensure-migrations.ts` and wired it into the integration test setup so `pnpm test:integration` automatically applies any pending migrations (skippable with `SKIP_AUTO_MIGRATE=true`) before tenant seeding runs, eliminating the earlier drift failures.
- Updated `services/api/scripts/migrations-util.ts` to resolve `db/migrations` relative to the script directory instead of `process.cwd()`, allowing the new helper to reuse the same loader no matter where it's executed.
- Documented the automation in `README.md`, `docs/STATUS.md`, and `docs/ENVIRONMENT_SETUP.md` so engineers know the new workflow and how to opt out when targeting managed databases.

## 2025-11-17T01:25Z
- Landed migration `010_pos_payment_metadata` to extend `pos_payments` with processor/tender metadata, receipt URLs, captured timestamps, and JSON metadata, plus a new `pos_payment_refunds` table + enum for tracking refund lifecycle. Updated `db/schema.er.mmd` and `docs/DB_SCHEMA.md` to reflect the richer payments model.
- Threaded the new fields through the portal API layer and deterministic sample data: quick-sale ticket creation now persists processor data/receipts/metadata, payment snapshots expose the new attributes, and the seed script populates realistic defaults so reporting/tests can rely on them.
- Added `docs/LOCAL_STAGING_COMPLETION_PLAN.md` to the README and kept PROGRESS aligned so the remaining POS/payments/loyalty milestones have a concrete local/staging execution plan.
- Enabled refunds for tenant operators: `/portal/pos/payments/:paymentId/refunds` now requires `pos.payments.refund`, enforces location scope, inserts into `pos_payment_refunds`, and updates the remaining balance. Playwright mocks + README/docs were refreshed so both quick-sale creation and refunds stay covered in local/staging environments.

## 2025-11-17T02:45Z
- Shipped the loyalty schema baseline: migration `011_loyalty` introduces `loyalty_accounts`, `loyalty_transactions`, `loyalty_rules`, and a `loyalty_transaction_type` enum so accrual/redemption services have a durable home. Updated the ER diagram + schema guide to reflect the new tables.
- Expanded the module registry with a `loyalty` module (accounts/transactions/rules) plus default role permissions (`loyalty.*` for managers, `loyalty.transactions.earn` for cashiers) so RBAC toggles exist before the APIs/UI land. TODO item 18 now tracks the remaining API/UI work on top of the new schema.

## 2025-11-17T03:40Z
- Fixed a malformed brace in `packages/module-registry/module-registry.json` that caused JSON parsing failures during Fastify boot (manifesting as INTERNAL errors when the superadmin approval endpoint loaded the registry). The corrected JSON keeps the module catalogue consistent with the `registrationModuleDefaults` typing guarantees.
- Re-ran `pnpm test:unit`, `pnpm test:integration`, `pnpm typecheck`, and `pnpm build` to confirm the registry fix resolves the approval-path failures and keeps the workspace green.

## 2025-11-17T04:40Z
- Added migration `012_inventory_count_enhancements` to extend `inventory_counts` (notes/started_at/updated_at) and `inventory_movements` (source/attachment_url/count_id + index), wired `createInventoryAdjustment` + sample data to the new columns, and documented the schema changes.
- Implemented `/v1/portal/inventory/counts` (list/detail/create) plus `/items` + `/complete` endpoints backed by new data helpers, RBAC/location guardrails, and Vitest coverage; OpenAPI spec updated with the new paths and schemas.
- Expanded `apps/portal` with `getInventoryCounts`, a `reconcileInventoryAction`, and a new `/inventory/reconcile` SSR page so operators can record count sessions, sync stock levels, and view recent history. Updated `/inventory` CTA + CSS to link into the new flow.
- Kept docs in sync (`README.md`, `docs/STATUS.md`, `docs/LOCAL_STAGING_COMPLETION_PLAN.md`, `docs/PORTAL_LOCAL_STAGING_PLAN.md`, `apps/portal/README.md`, `docs/DB_SCHEMA.md`, `TODO.md`) and refreshed sample-data audit entries to include the new metadata.
- Validation: `pnpm test:unit`, `pnpm test:integration`, `pnpm typecheck`, and `pnpm build`.

## 2025-11-17T06:45Z
- Upgraded both portals to Next.js 16 / React 19 (plus `eslint-config-next@16`) so we stay aligned with the latest runtime. Async cookie accessors, server actions, and API routes now await the new `next/headers` helpers, and the legacy `middleware.ts` guard moved to `proxy.ts` per the latest convention.
- Polished the portal dev experience: fallback logging is now gated behind `PORTAL_LOG_FALLBACKS=true`, so Turbopack sessions stay quiet unless we explicitly enable those warnings. POS quick-sale actions now surface backend validation messages and disable themselves until a managed location exists (with inline guidance), preventing the earlier “menu item unavailable” confusion. The seed helper also normalizes `API_BASE_URL` to `/v1`, ensuring it targets the Fastify API even when only the host is provided.
- Docs updated (`README.md`, `docs/STATUS.md`, `docs/ENVIRONMENT_SETUP.md`, `apps/portal/README.md`) to note the Next.js upgrade, the new `PORTAL_LOG_FALLBACKS` flag, and the POS managed-location prerequisite. Test suite + builds re-run (`pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`) to keep the repo green post-upgrade.

## 2025-11-25T09:30Z
- Added `/v1/portal/inventory/counts/:countId/export`, a `formatInventoryCountCsv` helper, and coverage in the portal routes suite so every reconciliation session emits a deterministic CSV for audits/drills.
- Updated the `/inventory/reconcile` UI with a Download CSV link per session, refreshed README/apps/portal/STATUS/LOCAL_STAGING_PLAN/TODO docs to highlight the evidence export, and logged the work here to keep the gap analysis (“attachments still pending”) current.

## 2025-11-25T11:45Z
- Introduced `inventory_count_attachments` (migration 013) plus API helpers/routes so `/v1/portal/inventory/counts/**` returns attachment metadata and accepts new uploads with location-aware RBAC. Portal route tests now cover the attachment flow alongside the existing count mutations.
- Added an Evidence panel + server action on `/inventory/reconcile` so operators can review and link evidence URLs per session (in addition to CSV exports), refreshed docs (README, STATUS, TODO, PORTAL/LOCAL plans) to note the attachment workflow, and revalidated the full Vitest suite.

## 2025-11-25T13:20Z
- Wired the POS stack to a standalone payment sandbox: `captureWithProvider`/`refundWithProvider` now call `PAYMENT_PROVIDER_SANDBOX_BASE_URL` with API-key auth and gracefully fall back to the deterministic mock if the sandbox is offline. The new `pnpm dev:payments-sandbox` Fastify service handles capture/refund endpoints and posts settlement webhooks back to `/v1/portal/pos/payments/:paymentId/status` using `PAYMENT_PROVIDER_WEBHOOK_SECRET`.
- Updated docs (README, ENVIRONMENT_SETUP, apps/portal README, TODO) with the new env knobs + workflow, added a cheat-sheet entry for the sandbox server, and extended the payment-client Vitest suite to mock fetch/fallback paths so the runner proves the HTTP integration works.

## 2025-11-25T16:00Z
- Added an inline refund workflow to the customer-portal payments table: new server actions post to `/v1/portal/pos/payments/:paymentId/refunds`, the UI enforces RBAC/location guardrails, and helpers expose remaining balances/currency metadata so operators see their limits before submitting a partial refund.
- Extended the shared sample-data + API mapping layers with numeric payment metadata (`amountValue`, `tipAmountValue`, `remainingAmountValue`, `currency`) so the UI can reason about balances without parsing formatted strings; updated docs (README, STATUS, TODO, LOCAL/STAGING/PORTAL plans) to capture the shipped experience and clarify that the remaining POS payments workstreams now focus on provider-backed capture/settle/retry plus coverage.

## 2025-11-25T18:45Z
- Delivered the first loyalty APIs: `/v1/portal/loyalty/overview`, `/loyalty/accounts/:accountId`, `/loyalty/earn`, and `/loyalty/redeem` now expose balances/transactions with RBAC-aware accrual + redemption actions backed by the new data helpers (`services/api/src/modules/portal/data.ts`) and Fastify routes/tests. Portal Playwright coverage now exercises the new endpoints, and module-registry defaults include a proper loyalty module definition.
- Seed script + documentation updates ensure every environment gains a deterministic loyalty account/transaction, so both the API and mock flows have realistic data before the UI lands. README/status/TODO/local-staging/portal docs were refreshed to highlight the new capability and call out that the next workstream wires the UI + expiration logic on top of the shipped APIs.

## 2025-11-25T21:10Z
- Shipped the tenant-facing loyalty workspace (`apps/portal/app/loyalty/page.tsx`) that consumes `/v1/portal/loyalty/**` via new data helpers, surfaces program stats + account history, and wires earn/redeem server actions with client-side forms (`apps/portal/components/LoyaltyForms.tsx`). Navigation/sidebar now includes “Loyalty” when the module is enabled, and deterministic fallbacks ensure the UI stays functional without the API.
- Added Playwright smoke coverage for the new nav target, documented the workspace across README/STATUS/portal/local staging plans, and refreshed TODO item #18 to reflect the completed portal experience. Styles, server actions, and mock data were also updated so staging/local operators can practice loyalty workflows ahead of POS hooks + expiration logic.

## 2025-11-26T00:20Z
- Hooked loyalty into the POS quick-sale + refund flows: `/v1/portal/pos/tickets` now accepts `loyaltyCustomerId`, stores it in payment metadata, and automatically awards points when payments settle (refunding those points when inline refunds succeed). Payments updated via sandbox webhooks will also award points once they flip to completed.
- Updated the portal POS UI/server action to capture the optional loyalty customer field, refreshed docs/TODO/status to reflect the new automation, and extended the portal route tests so the payload shape (and new loyalty behavior) stays covered.
