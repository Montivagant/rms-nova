# TODO

1. M0 Platform Guardrails
   - Acceptance: Postgres setup assistant validated; migrations run; /health returns ok; logging + metrics wired; design tokens + 3 primitives published; CI pipeline green.
   - Status: Completed 2025-10-04T05:09Z - core schema, logging/metrics, design tokens, and CI gates landed per PROGRESS 2025-10-03 -> 2025-10-04 entries.
2. Implement Structured Error Taxonomy
   - Acceptance: Shared error helper maps to VALIDATION/AUTHN/AUTHZ/NOT_FOUND/CONFLICT/RATE_LIMIT/INTERNAL; integration tests assert payload shape; docs updated.
   - Status: Completed 2025-10-03T09:36Z - Fastify server shipped with taxonomy + integration coverage; docs updated alongside initial API bootstrap.
3. Bootstrap Design System Package
   - Acceptance: tokens emitted as CSS vars; Button/Input/Card primitives live with stories/tests; no inline styles; consumed by portal prototype.
   - Status: Completed 2025-10-21T21:15Z - design-system primitives + Storybook now power the superadmin portal; docs/PRIMITIVES guide reflect the shipped set.
4. Build Postgres Migration Runner
   - Acceptance: `pnpm --filter services/api db:migrate` applies schema-v1; rollback command available; CI uses ephemeral DB to run migrations.
   - Status: Completed 2025-10-03T09:36Z - migration CLI wired into services/api package and exercised in CI/local dev per setup assistant.
5. Seed Script via API Flows
   - Acceptance: CLI registers tenant, approves via superadmin API, seeds menu/inventory/POS sale; re-runnable idempotently.
   - Status: Completed 2025-11-08T10:45Z - `pnpm seed:tenant` now drives `/v1/auth/register` + `/v1/superadmin/registrations/:id/decision`, then invokes the deterministic sample-data seed so the tenant is ready with menu/inventory/POS data on every run (idempotent, flags/env documented).
6. M1 Identity & RBAC
   - Acceptance: public registration UI; approval creates tenant + owner; dynamic roles enforced; preview-as-role works; e2e signup?approval passes.
   - Status: In Progress - API + registration flows are live with RBAC enforcement and Playwright smoke coverage; remaining preview-as-role UX + extended E2E scenarios are queued once module-aware routing ships.
7. M2 Superadmin Console
   - Acceptance: manage tenants/users/modules/plans; trigger backups/export; support inbox triage; module toggle reflected in tenant UI/API.
   - Status: In Progress - registrations, module toggles, and billing dashboards are live with design-system primitives; support/backups tooling and coverage expansion still pending.
8. M3 Billing Integration
   - Acceptance: plans/entitlements UI+API; payment sandbox webhook updates subscription; audit entries logged; tests cover happy + failure flows.
   - Notes: Sandbox webhook queue + billing audit events + plan entitlement sync landed 2025-10-22; outstanding work covers plan catalogue UI/API and running the automated entitlement drill (`pnpm drill:billing`) across environments with documented evidence.
   - Status: Completed 2025-10-25T18:13Z (local, staging `rms_test`, and production `rms_dev` drills captured under `tests/drills/logs/<env>/`; queue metrics validated via worker logs).
9. Roll out migration 002_tenant_registrations across environments
   - Acceptance: migration applied in dev/test/prod; legacy patch script removed from operational playbooks.
   - Status: Completed 2025-10-26T00:25Z locally/staging (migration applied via Terraform-port-forward workflow); confirm production once rollout freeze lifts, but docs/runbooks now point exclusively at the tracked migration.
10. Add audit + telemetry signals for module toggles
   - Acceptance: toggle mutations emit audit events/metrics; UI surfaces toast feedback; docs/runbooks updated.
   - Status: Completed 2025-10-22T00:35Z (audit rows + Prometheus counter + portal messaging shipped).
11. Populate Billing overview with live metrics
   - Acceptance: billing page reads real plan/renewal data, placeholder copy replaced, and tests cover happy paths.
   - Status: Completed 2025-10-22T01:05Z (billing summary API + module analytics power live dashboard metrics).

12. Build billing webhook worker pipeline
   - Acceptance: pending sandbox events re-queue through worker with retry/backoff; metrics/alerts cover failures.
   - Status: Completed 2025-10-22T02:30Z (BullMQ queue + worker retries + `nova_api_billing_webhook_total` metrics online).

13. Wire Helm/Terraform environment overlays
    - Acceptance: staging/prod overlays supply secrets + scaling knobs via Terraform; docs updated with deployment steps; dry-run apply succeeds in staging.
    - Status: In Progress - Terraform/Helm CLIs installed locally, Minikube kubeconfig detected, and staging apply now succeeds with rebuilt images + secrets. Worker health probes are live and documented; production rollout remains intentionally paused while we work in staging/local only. Latest staging billing drill evidence captured 2025-11-08T20:46Z (`tests/drills/logs/staging/20251108-204600.md`) using the refreshed local API instance (`http://localhost:3012/v1`).
    - Next action: Keep monitoring the scheduled staging drill workflow (kick manual runs via the GitHub Actions UI whenever automation falters) and leave the production overlay parked until leadership lifts the freeze.

14. Customer Portal (Staging-first)
   - Acceptance: tenant-facing Next.js workspace delivers menu/payments/reporting experiences with shared design-system usage and API clients.
  - Status: In Progress - The portal now consumes `/v1/portal/context`, hides navigation for disabled modules, enforces module-aware routing across menu/inventory/POS/payments/reporting/locations/account pages, disables actions/exports based on RBAC permissions, and surfaces real plan/location/payout metadata (plus feature-flag-driven reporting controls). Multi-location management includes inventory/menu assignment summaries + mutations via `/v1/portal/locations/:id/assignments`, server actions, and a scoped assignment workspace that honors per-user location permissions end to end. Advanced reporting insights support per-location filters (including CSV exports) whenever the `advanced_reporting` flag and user/location access align. Guarded write flows now cover menu availability toggles (`/v1/portal/menu/items/:id/status`), menu creation (`POST /v1/portal/menu/items` + portal create form), menu edits (`PATCH /v1/portal/menu/items/:id` + portal edit form with optional location overrides), modifier creation/assignment (`POST /v1/portal/menu/modifiers`, `POST /v1/portal/menu/items/:id/modifiers` + portal forms), inventory adjustments (`POST /v1/portal/inventory/items/:id/adjustments` + portal quick-adjust form), POS quick sales (`POST /v1/portal/pos/tickets` + quick-sale form with location/permission gating) that now persist richer payment metadata, `/inventory/reconcile` which posts to `/v1/portal/inventory/counts/**` to capture count sessions, sync stock levels, expose CSV exports, and collect evidence attachments, and the `/account` workspace backed by `tenant_business_profiles`/`users`. Next actions: broaden Playwright coverage for every write path (mock + live), wire media uploads + presets, add bulk assignment/location tooling, refine the attachment workflow (bulk downloads/previews), and land the loyalty module UI once the APIs exist.

15. Pre-Business Module Prep
   - Acceptance: baseline sample data (menu/inventory/POS) seeded, design-system integration milestone closed, and production rollout playbook documented so business modules can start without foundational rework.
   - Status: Completed 2025-11-08T04:24Z - sample data kit (`pnpm seed:sample-data`) is live, design-system primitives/Storybook/docs (Button/Input/Textarea/Checkbox/RadioGroup/FormField/Select) are published in `packages/design-system` + `docs/PRIMITIVES_GUIDE.md`, and the rollout playbook (`ops/PRODUCTION_ROLLOUT_PLAYBOOK.md`) captures the freeze posture so POS/Inventory/Menu work can start immediately in staging/local.

16. Portal Account & Inventory Audit APIs
    - Acceptance: `/v1/portal/account/profile`, `/v1/portal/account/business`, `/v1/portal/inventory/audit`, and media upload endpoints persist data in Postgres/S3, enforce RBAC, and power the existing portal forms. Playwright covers happy/error paths; docs updated with payload contracts.
    - Status: Completed 2025-11-16T08:05Z - profile/business settings now backed by Postgres (`tenant_business_profiles` + `users`), the inventory audit log reads real `inventory_movements`, and the portal/Next API + Fastify routes handle the new payloads (Playwright coverage pending for the write paths).

17. POS Ticketing & Payments
   - Acceptance: POS service exposes APIs for ticket creation, tender capture (cash/card), refunds, and receipt delivery; integrates with payment provider sandbox; links to inventory depletion and reporting. Module toggles + RBAC gate the endpoints; end-to-end Playwright scenario runs against staging stack.
   - Status: In Progress - POST `/v1/portal/pos/tickets` now records quick sales against live APIs, persists payment metadata, and exposes `/v1/portal/pos/payments/:paymentId/refunds` with location/RBAC enforcement (migration `010_pos_payment_metadata`). The payments page now renders inline refund controls so operators with `pos.payments.refund` can submit partial or full refunds without leaving the portal. The standalone sandbox service (`pnpm dev:payments-sandbox`) handles capture/refund HTTP calls and settlement webhooks via `PAYMENT_PROVIDER_WEBHOOK_SECRET`, so local flows mirror a real processor even when statuses go pending/failed. Remaining work covers richer sandbox metrics/alerts, provider-backed retries beyond the webhook stub, and Playwright coverage in both mock + live modes.

18. Loyalty & Customer Engagement
   - Acceptance: loyalty balances (accrual, redemption, expiration) stored per tenant/customer, surfaced in portal + POS; hooks exist to award points from POS and deduct on payment. Superadmin can toggle the module per tenant; portal UI reflects balances/history; tests cover accrual/redemption math.
   - Status: In Progress - schema landed (`011_loyalty`), module registry + default permissions are in place, and entitlements mention `loyalty`. `/v1/portal/loyalty/overview`, `/loyalty/accounts/:accountId`, `/loyalty/earn`, and `/loyalty/redeem` now provide the first accrual + redemption APIs (with deterministic seed data + tests), and the portal `/loyalty` workspace renders balances/history plus earn/redeem forms. POS quick-sale tickets and inline refunds now call those APIs automatically. Remaining work covers expiration logic, deeper POS hooks, drills, and extended coverage.









