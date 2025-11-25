# Nova RMS Blueprint

Nova RMS is the next-generation modular restaurant management system. This repository captures architecture, planning, and operational guardrails required to implement the platform milestone by milestone.

## Current Focus
- All execution happens in local + Minikube staging environments first so we can iterate safely before reopening any managed production targets.
- Production overlays and managed clusters remain intentionally paused; keep shipping customer-facing portals and business modules via staging/local until production reopens.
- Documentation, automation, and runbooks assume this staging/dev-first posture; follow `docs/ENVIRONMENT_SETUP.md` and `ops/RUNBOOK.md` to mirror that flow.
- The customer portal now includes a multi-location assignment workspace (inventory + menu overrides) powered by `/v1/portal/locations/:id/assignments` with deterministic sample-data fallbacks, so QA can stress the experience even when the API is offline.
- Advanced reporting insights (feature-flagged) render revenue/ticket/category widgets on `/reporting`, giving analysts quick summaries even when API calls fall back to sample data, and CSV exports respect the new per-location filters.
- The first POS ticket write flow ships as a quick-sale form on `/pos` + `/v1/portal/pos/tickets`, wiring deterministic item pricing, payments, and reporting updates across the stack, and now accepts an optional loyalty customer identifier so completed sales award points (refunds deduct them automatically).
- Quick-sale actions require at least one managed location in the tenant (or rest seed) and now surface backend validation errors inline. When the API rejects a sale, the portal shows the exact Fastify message so it’s obvious whether you’re missing a menu item, location assignment, or permission.
- POS quick sales now persist processor/tender metadata (reference, brand, last4, receipt URL) and `/v1/portal/pos/payments/:paymentId/refunds` enables authorized refunds; configure `PAYMENT_PROVIDER_MODE` (mock by default) when you start wiring a real sandbox.
- Payments view now includes inline refund controls so RBAC-approved operators can submit partial or full refunds directly from the table while respecting location scopes and remaining balances.
- A standalone payment sandbox server (`pnpm dev:payments-sandbox`) now mirrors real processor behavior: capture/refund calls go over HTTP with API keys, and settlement webhooks hit `/v1/portal/pos/payments/:paymentId/status` using `PAYMENT_PROVIDER_WEBHOOK_SECRET`, so local iterations look like a real integration (pending/failed flows use env-driven outcomes).
- When exercising the sandbox locally, set `PAYMENT_PROVIDER_SANDBOX_OUTCOME=pending|failed` to simulate processor responses before a real integration exists; leave it unset for the default completed path.
- Set `PAYMENT_PROVIDER_MODE=real_provider` (with `PAYMENT_PROVIDER_BASE_URL`, `PAYMENT_PROVIDER_API_KEY`, and the shared webhook secret) when you’re ready to hit a real gateway; the API now routes capture/refund calls to that provider and the sandbox-only mode remains available for dev/test.
- Menu creation + edits are programmable via `/v1/portal/menu/items` and `/v1/portal/menu/items/:id` plus the new portal authoring forms, and modifiers can be created (`/v1/portal/menu/modifiers`) + assigned (`/v1/portal/menu/items/:id/modifiers`) so operators handle naming/pricing/tax/modifiers (with optional location overrides) while staying in sync with RBAC/location guardrails.
- The new `/account` workspace lets operators manage profile details, stage avatar uploads, document business metadata, and prep menu imagery using placeholder storage while the production account/media APIs are finalized.
- Inventory reconciliation now ships alongside the existing audit log: `/inventory/reconcile` posts to `/v1/portal/inventory/counts` -> `/items` -> `/complete`, capturing counted quantities per item, syncing stock levels, and logging the resulting adjustments with location-aware RBAC. Every session includes one-click CSV exports plus attachment slots, so operators can link photos/signed sheets alongside the reconciliation record without copy/pasting from the UI.
- Loyalty groundwork is live: `/v1/portal/loyalty/overview`, `/loyalty/accounts/:accountId`, `/loyalty/earn`, and `/loyalty/redeem` now expose balances/transactions plus guarded accrual + redemption actions, and the seed script populates a deterministic loyalty account so portals/tests have real data. The tenant portal now ships a `/loyalty` workspace that surfaces those APIs with account lists, transaction history, and earn/redeem forms for staging/local environments.
- Playwright portal tests now boot a lightweight mock API server (`tests/e2e/portal/mock-api-server.ts`, launched via `tests/e2e/portal/run-portal-with-mock.ts`) on `127.0.0.1:3999` that serves the deterministic sample-data kit with write acknowledgements, so menu/location/reporting/POS flows run without a live backend; `tests/e2e/portal/PLAYWRIGHT_PLACEHOLDER.md` documents the setup plus the new `PLAYWRIGHT_PORTAL_API_MODE` switch (`mock` default, `live` for targeting a real API host once it is available).
- Immediate next step: broaden portal Playwright coverage for the new authoring flows and start layering richer presets (modifiers/location defaults) while keeping staging billing drills green.
- Local/staging completion details now live in `docs/LOCAL_STAGING_COMPLETION_PLAN.md`, covering the remaining POS, payments, loyalty, inventory reconciliation, and testing/ops milestones required before production reopens.

## Key Artifacts
- `apps/superadmin/README.md` - Superadmin portal plan, run instructions, and roadmap.
- `apps/portal/README.md` - Customer-portal workspace notes, run instructions, and upcoming milestones.
- `packages/sample-data/` - Shared deterministic dataset powering seed scripts, portal fallbacks, and mock API responses.
- `01_Context.md` - Business scope, legacy pitfalls, and non-negotiables for Nova RMS.
- `02_Architecture.md` - Modular monolith design, tenancy strategy, internal events, and milestone roadmap.
- `packages/module-registry/module-registry.json` - Canonical module/feature/action catalogue driving dynamic RBAC and UI guards.
- `design-system/README.md` - Token definitions, primitives, and pattern usage rules (no inline styles).
- `docs/PRIMITIVES_GUIDE.md` - Quick-start usage guide for the exported primitives (Button/Input/Textarea/Checkbox/FormField/RadioGroup).
- `db/migrations` - PostgreSQL baseline schema with tenant_id constraints, partitions, and seed workflow.
- `db/README.md` - Postgres setup assistant covering installation checks, role/DB creation, migrations, and backups.
- `api/openapi-v1.yaml` - Unified OpenAPI 3 spec for Identity, Tenant Registry, RBAC, Module Registry, Superadmin, Billing, Support, POS, and Inventory endpoints.
- `tests/TESTPLAN.md` - Testing pyramid across unit, integration, and E2E with real API-based seeding.
- `ops/RUNBOOK.md` - Deployment, monitoring, maintenance, and incident response procedures.
- `ops/PRODUCTION_ROLLOUT_PLAYBOOK.md` - Deferred cut-over plan documenting the eventual production rollout (reference only until staging sign-off).
- `infra/monitoring/README.md` - Grafana dashboards and Prometheus alert definitions for operational telemetry.
- `infra/helm/nova-stack` - Helm chart packaging the API + worker deployments.
- `infra/terraform` - Terraform scaffold for driving the Helm release and environment overlays.
- `infra/k8s` - Supporting manifests (e.g., secret templates) applied alongside Terraform/Helm.
- `docs/ENVIRONMENT_SETUP.md` - Registry endpoints, Minikube network, and default secrets/env values.
- `docs/SAMPLE_DATA.md` - Sample-data seeding instructions for menu/inventory/POS baselines.
- `TODO.md` - Milestone backlog with owners and acceptance criteria.
- `PROGRESS.md` - Timestamped activity log.
- `docs/PORTAL_LOCAL_STAGING_PLAN.md` - Local/staging execution strategy, placeholder API instructions, readiness assessment vs. business goals, and the prioritized UI/UX upgrade backlog.

## Directory Layout
```
apps/            # portal + superadmin shells
apps/superadmin  # Next.js superadmin console (in progress)
apps/portal      # Tenant-facing Next.js customer portal (staging/local-first)
packages/        # shared libraries (design system, auth, rbac, module-registry, billing)
services/        # api gateway + background worker
api/             # OpenAPI definitions
db/              # schema + setup assistant
design-system/   # design system documentation
infra/           # CI/CD, IaC, monitoring artifacts
ops/             # runbooks and ops artifacts
tests/           # test plans and helpers
  tests/drills    # operational drill guides
```

## Getting Started
1. Follow `db/README.md` to provision Postgres roles/databases and validate migrations.
2. Duplicate `.env.example` to `.env` and supply secrets.
3. Install dependencies with `pnpm install`.
4. Run `pnpm --filter @nova/api db:migrate` then `pnpm --filter @nova/api dev` to bring up the API skeleton on port `3000`.
5. Use `TODO.md` to pick the next M0 task and update `PROGRESS.md` after completion.
6. To register + approve a tenant via API flows (and then seed menu/inventory/POS data), first mint a temporary superadmin token (`pnpm tsx scripts/generate-superadmin-token.ts > superadmin-token.latest`) and export it (`$env:SUPERADMIN_TOKEN = Get-Content superadmin-token.latest`). Then run `pnpm seed:tenant -- --business-name "Demo Coffee" --owner-email demo@example.com --owner-password "Owner@12345"` (see script flags or env vars for overrides).
7. When you only need to reseed deterministic data for an existing tenant, run `pnpm seed:sample-data -- --tenant-alias <alias>` (details in `docs/SAMPLE_DATA.md`).
8. For the superadmin portal, run `pnpm dev:superadmin` (port `3000`). For the tenant-facing customer portal, run `pnpm dev:portal` (port `3100`) after seeding sample data for your tenant. Sign in at `http://localhost:3100/login` (credentials flow hits `/v1/auth/login`, stores the session in an HTTP-only cookie, and unlocks dashboard/menu/inventory/POS/payments/reporting views). Keep both portals alongside the API (`pnpm --filter @nova/api dev`, port `3000`) and worker (`pnpm --filter @nova/worker dev`, health server on `3001`). `pnpm dev:backend` launches the API+worker together; `pnpm dev:stack` now runs API + worker + both portals if you want a single command. Configure `PORTAL_API_BASE_URL` and `PORTAL_ACCESS_TOKEN` (or their NEXT_PUBLIC counterparts) when you want the portal to hit a specific API host (set `.env.local` to `PORTAL_API_BASE_URL=http://localhost:3000` for the default dev stack); it automatically falls back to the shared `@nova/sample-data` dataset if endpoints are unavailable or the tenant has zero activity. All `/v1/**` requests are proxied via Next.js rewrites, so browser fetches avoid CORS when `API_BASE_URL` points at `http://localhost:3000`. Use `pnpm test:e2e` for the superadmin Playwright smoke suite and `pnpm test:e2e:portal` for the customer-portal smoke test.
9. Want payment flows to look like a real processor? Run the sandbox server locally (`pnpm dev:payments-sandbox`) so capture/refund calls hit HTTP endpoints and webhooks update statuses using `PAYMENT_PROVIDER_WEBHOOK_SECRET`. Configure `PAYMENT_PROVIDER_MODE=sandbox`, `PAYMENT_PROVIDER_SANDBOX_BASE_URL`, and `PAYMENT_PROVIDER_SANDBOX_API_KEY` in your `.env` before exercising POS flows.

## Command Cheat Sheet
| Task | Command |
| --- | --- |
| Install dependencies | `pnpm install` |
| Run API + worker (ports 3000/3001) | `pnpm dev:backend` |
| Run full stack (API + worker + both portals) | `pnpm dev:stack` |
| Launch portals individually | `pnpm dev:superadmin -- -p 3000` / `pnpm dev:portal -- -p 3100` |
| Apply migrations | `pnpm --filter @nova/api db:migrate` |
| Mint superadmin token | `pnpm tsx scripts/generate-superadmin-token.ts > superadmin-token.latest` |
| Inspect an issued token | `pnpm tsx scripts/verify-token.ts (Get-Content superadmin-token.latest)` |
| Seed tenant via API flow | `pnpm seed:tenant -- --business-name "Demo Coffee" --owner-email demo@example.com` |
| Seed deterministic data only | `pnpm seed:sample-data -- --tenant-alias demo-coffee` |
| Smoke billing drill locally/staging | `pnpm drill:billing --env-file tests/drills/staging.drill.env` |
| API integration tests | `pnpm test:integration` (auto-runs pending migrations unless `SKIP_AUTO_MIGRATE=true`) |
| Superadmin Playwright smoke | `pnpm test:e2e` |
| Portal Playwright smoke | `pnpm test:e2e:portal` (auto-starts the mock API server on `127.0.0.1:3999`) |
| Run payment sandbox | `pnpm dev:payments-sandbox` (listens on `http://127.0.0.1:4015`, drives capture/refund HTTP + webhooks) |

See `docs/ENVIRONMENT_SETUP.md`, `docs/SAMPLE_DATA.md`, and `tests/TESTPLAN.md` for deeper context around environment variables, data flags, and required coverage.

## Milestone Overview
- **M0** Platform & Guardrails: schema, logging, metrics, design tokens, CI, health checks.
- **M1** Identity + Tenant Registry + RBAC + Module Registry.
- **M2** Superadmin Console capabilities.
- **M3** Billing & Plans with sandbox payments.
- **M4-M8** Business modules (POS / Inventory / Menu / Orders/KDS / Reporting).

## Contributing & Security
Refer to `CONTRIBUTING.md` for workflow expectations and `SECURITY.md` for responsible disclosure guidelines.

All documentation uses ASCII characters for compatibility with tooling.
- 'docs/ENVIRONMENT_SETUP.md' - Environment, registry, and secret defaults.

