# Customer Portal Workspace

The Nova customer portal delivers tenant-facing experiences (dashboard, menu, inventory, POS reporting) while we keep shipping everything in local + Minikube staging environments.

## Backend Prerequisites
- API listening on `http://localhost:3000` via `pnpm --filter @nova/api dev` (or `pnpm dev:backend` which also launches the worker).
- Worker health server on `http://localhost:3001` (exposed when you run `pnpm --filter @nova/worker dev` or `pnpm dev:backend`); readiness checks keep BullMQ + DB wiring honest.
- Postgres + Redis running (use Docker Compose from `db/README.md` or Minikube services defined in `infra/k8s/staging-datastores.yaml`).
- Deterministic tenant data via `pnpm seed:tenant` + `pnpm seed:sample-data` so Login + `/v1/portal/**` calls have real content.

## Running Locally
1. Ensure the backend prerequisites above are met (API :3000, worker health :3001, Postgres/Redis running).
2. Seed sample data for your tenant if you need realistic records: `pnpm seed:sample-data -- --tenant-alias demo-coffee`.
3. Create `apps/portal/.env.local` (or edit the existing file) with at least:
   ```
   PORTAL_API_BASE_URL=http://localhost:3000
   ```
   Add `PORTAL_ACCESS_TOKEN` / `NEXT_PUBLIC_PORTAL_ACCESS_TOKEN` when you want to bypass `/login` during smoke tests.
4. Start the portal:
   ```bash
   pnpm dev:portal
   ```
   The Next.js dev server listens on `http://localhost:3100`. Set `.env.local` with `PORTAL_API_BASE_URL=http://localhost:3000` (or the host you want) so the proxy hits the correct API.
5. When `PAYMENT_PROVIDER_MODE=sandbox`, run the standalone payment sandbox so capture/refund calls have a real HTTP target and settlement webhooks update the API automatically:
   ```bash
   pnpm dev:payments-sandbox
   ```
   The sandbox listens on `http://127.0.0.1:4015` by default and uses `PAYMENT_PROVIDER_SANDBOX_API_KEY` + `PAYMENT_PROVIDER_WEBHOOK_SECRET` for authentication.

### Mock API workflow
- Start the deterministic mock API when you want backend-free UI work: `pnpm tsx tests/e2e/portal/mock-api-server.ts` (defaults to `http://127.0.0.1:3999`).
- Point `PORTAL_API_BASE_URL` (or `NEXT_PUBLIC_PORTAL_API_BASE_URL`) at the mock host/port or run `pnpm tsx tests/e2e/portal/run-portal-with-mock.ts` (used by `pnpm test:e2e:portal`) to launch both the portal and mock automatically.
- Toggle `PLAYWRIGHT_PORTAL_API_MODE` between `mock` and `live` whenever Playwright should target the mock server vs. the real Fastify API. The mock mirrors `/v1/portal/**` routes and exposes `POST /__mock__/reset` for test isolation.

### Configuration
- `PORTAL_API_BASE_URL` (or `NEXT_PUBLIC_PORTAL_API_BASE_URL`): overrides the default `http://localhost:3000` API origin.
- `PORTAL_ACCESS_TOKEN` (or `NEXT_PUBLIC_PORTAL_ACCESS_TOKEN`): optional bearer override for automation (when set, middleware treats the request as authenticated without hitting `/login`).
- `PORTAL_LOG_FALLBACKS`: set to `true` if you explicitly want to log fallback-to-sample-data events during development; leave unset/false to prevent noisy warnings in Next 16’s Turbopack console.
- When the API call fails or returns a non-2xx status, the UI automatically falls back to the deterministic sample dataset so local/staging work keeps moving.
- Middleware enforces authentication for every route except `/login` and `/api/session`; if no cookie is present and no env token is configured, users are redirected to the login screen.
- Payments sandbox toggles (live API mode): set `PAYMENT_PROVIDER_MODE=sandbox` and optionally `PAYMENT_PROVIDER_SANDBOX_OUTCOME=completed|pending|failed` to exercise payment/refund status handling before wiring a real processor.
- Real payment provider mode: set `PAYMENT_PROVIDER_MODE=real_provider` alongside `PAYMENT_PROVIDER_BASE_URL`, `PAYMENT_PROVIDER_API_KEY`, and `PAYMENT_PROVIDER_WEBHOOK_SECRET` on the API/worker to route capture/refund calls to your gateway. The portal continues to call the Fastify API—no extra client config is required.

## Feature Scope (M2 -> M3 bridge)
- Shared shell + navigation composed from the Nova design system with `/login` + middleware guarding everything except `/login` and `/api/session`.
- Dashboard, Menu, Inventory, POS, Payments, Reporting, and Locations read from `/v1/portal/**` with deterministic `@nova/sample-data` fallback whenever API calls fail or a tenant lacks activity.
- Payments surfaces tender totals, method/date filters, and CSV hooks with RBAC-aware permissions. Status badges now reflect completed/pending/refunded/failed results (with failure reasons + receipt links) coming from the POS payment APIs.
- Payments surfaces tender totals, method/date filters, CSV hooks, and inline refund controls. Operators with `pos.payments.refund` can submit partial or full refunds directly from the payment table; the form respects RBAC/location scopes and disables itself when the payment is already settled or fully refunded.
- Reporting shows revenue/ticket trends, category pivots, advanced insights (feature-flagged), and per-location filters that also scope CSV exports.
- POS view now includes a Quick sale form that posts to `/v1/portal/pos/tickets`, minting settled tickets + payments (the controls disable automatically whenever the portal falls back to the sample dataset) and persisting processor/tender metadata (reference, brand, last4, receipt URL) so the payments/reporting modules reflect realistic records. The form now requires at least one active **managed** location; otherwise it stays disabled and surfaces an inline hint. This prevents malformed tickets (and the backend now returns its full validation error which is displayed to the user).
- POS quick sale now accepts an optional loyalty customer field. When present (and the payment succeeds), the API automatically awards the configured loyalty points and deducts them when refunds are processed.
- Menu view now ships guarded create + edit forms plus modifier creation/assignment: `POST /v1/portal/menu/items` adds new entries (with optional location overrides), `PATCH /v1/portal/menu/items/:id` updates existing items, `/v1/portal/menu/modifiers` creates reusable modifiers, and `POST /v1/portal/menu/items/:id/modifiers` toggles linked modifiers so operators can manage naming/pricing/tax/modifiers entirely from the portal while respecting RBAC/location scopes (forms disable automatically when sample data is in play).
- Menu view exposes status badges + server actions wired to `/v1/portal/menu/items/:id/status` so authorized users can toggle items between Available/86d states inline.
- Inventory view includes the quick-adjust form that posts to `/v1/portal/inventory/items/:id/adjustments`, honoring RBAC + location scopes and instantly revalidating the grid. `/inventory/reconcile` extends that surface with a full count workflow powered by `/v1/portal/inventory/counts/**`, capturing sessions, counted quantities, syncing live stock levels, and exposing CSV exports + attachment slots for every session while `/inventory` renders the resulting audit rows from `/v1/portal/inventory/audit` (or the Playwright mock server).
- Locations view covers summaries (`/v1/portal/locations`) plus the assignment workspace (`/v1/portal/locations/:locationId/assignments`) with deterministic fallback data and strict permission mirroring in UI + API layers.
- Assignment reads/mutations respect per-user location scopes + `inventory.locations.read/manage_assignments` permissions; disabled controls include helper messaging when RBAC prevents an edit.
- Account view (`/account`) now hits real APIs: the profile form POSTs to `/api/account/profile` (which proxies `/v1/portal/account/profile`), the business form POSTs to `/api/account/business`, and both persist in Postgres (`users`, `tenant_business_profiles`). Avatar/media staging remains local until the object-storage workflow ships, but the core metadata is no longer a placeholder.
- Loyalty workspace is live: `/loyalty` consumes `/v1/portal/loyalty/**` to display balances, transaction history, and guarded earn/redeem forms (with deterministic sample data + mocks) so ops can exercise the workflows before production reopens.

## Next Steps
1. Finish the POS ticketing scope by integrating the payment provider sandbox (capture/refund APIs, receipts, background reconciliation workers) and add Playwright coverage for quick sales + refunds in both mock and live API modes.
2. Extend the loyalty workspace with expiration logic, POS hooks, and drills so the program is testable end to end.
3. Finish the reconciliation evidence story (attachments + CSV/PDF exports per count session) and wire `/account` media uploads so operators can manage avatars/menu imagery against real storage.
4. Expand reporting/payments exports to embed filter metadata (location/category/date) and keep this doc aligned with `docs/LOCAL_STAGING_COMPLETION_PLAN.md` as each milestone lands.

Keep this doc updated as the portal evolves. All UI should consume `@nova/design-system` primitives; avoid bespoke styling outside scoped CSS modules.
