# Test Plan

## Objectives
- Guarantee tenant isolation, RBAC enforcement, and core business flows stay intact per milestone.
- Maintain deterministic, fast feedback across unit, integration, and E2E layers without mocks.

## Test Pyramid
- **Unit** (fast, <5s per package): business logic, validators, RBAC checker, module registry loader, error taxonomy helpers.
- **Integration** (API + Postgres + Redis): signup?approval, role assignment, module toggle, POS ticket settlement, inventory movement, billing webhook ingestion.
- **E2E** (Playwright): signup?approval?first sale, inventory count lifecycle, support ticket resolution.

## Tooling
- Runner: Vitest (unit/integration), Playwright (E2E).
- HTTP assertions via Supertest; DB access via Drizzle test harness.
- Test DB: `rms_test` (created by Postgres setup assistant) using isolated schema per test via transactional hooks.
- Integration bootstrap automatically applies any pending SQL migrations before suites run (unless `SKIP_AUTO_MIGRATE=true`) so the test database always matches the latest schema before tenant seeding.

## Unit Suites
- `packages/rbac`: permission matcher, wildcard handling, preview-as-role guard.
- `packages/module-registry`: config loader, dependency validator, permission catalogue generator.
- `services/api`: request validators, error formatter, tenant context middleware.
- `packages/auth`: password policy, token rotation helpers, MFA secret generator.
- `services/worker`: health server factory (`createHealthServer`) ensuring `/healthz`/`/readyz` respond with accurate readiness signals for Kubernetes probes.

## Integration Suites
- **Signup ? Approval**: POST `/tenant/registrations`; superadmin decision; assert tenant, owner user, default modules.
- **Role lifecycle**: create role via `/rbac/roles`, assign to user, policy check before/after assignment.
- **Module toggle**: disable inventory for tenant (PATCH `/tenants/{id}/modules`) ? subsequent `/inventory/items` returns `AUTHZ`.
- **POS sale**: create inventory item, stock movement, ticket, payment; verify inventory deduction, audit event, outbox entry.
- **Billing event**: create plan, subscription, simulate webhook to flip status; verify entitlement update + audit.

Fixtures created via real API calls; no direct SQL inserts. Use helper `createTenantContext()` that orchestrates registration ? approval ? login and returns auth tokens + tenant info.

## E2E Scenarios (Playwright)
1. **Signup to First Sale**
   - Fill public registration form.
   - Superadmin console approves request.
   - Owner completes onboarding, invites cashier, creates menu item.
   - Cashier runs POS sale; dashboard shows revenue card > 0.
2. **Inventory Count Lifecycle**
   - Inventory manager schedules count, records quantities, finalizes, verifies adjustments, export file available.
3. **Support Ticket Resolution**
   - Business owner raises ticket; support agent responds via superadmin console; announcement posted; tenant receives toast.

Each scenario seeds via API helper; teardown calls internal cleanup endpoint to drop tenant schema/data.

## Coverage Targets
- Unit overall = 80%; RBAC + module registry 100% logic coverage.
- Integration: ensure each module-critical route executed at least once.
- E2E: 4 smoke flows (superadmin registrations + portal dashboard/payments/reporting); run nightly + pre-release.

## CI Pipeline
1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test:unit`
4. `pnpm test:integration` (spawns Postgres/Redis in Docker)
5. Build services
- `pnpm test:e2e` (superadmin Playwright smoke) on release branches
- `pnpm test:e2e:portal` (customer portal smoke) prior to staging demos
7. Upload coverage + Playwright traces as artifacts.

## Seeding Strategy
- `tests/support/seed.ts` uses official API clients (generated from `api/openapi-v1.yaml`).
- Seeds: base tenant, owner user, default modules, sample menu/inventory.
- Seeds executed via CLI `pnpm seed:test` prior to integration/E2E suites; cleanup via `pnpm seed:reset`.

## Stability Practices
- Wrap test DB interactions in transactions; rollback after each test.
- Disable automatic retries; instead poll deterministic endpoints with bounded wait.
- Use frozen clock utilities for time-based logic.

## Acceptance (per Milestone)
- **M0**: health endpoint integration test + smoke E2E against /health.
- **M1**: signup?approval and role tests green; Playwright flow #1 passing.
- **M2**: module toggle + support ticket integration tests green; Playwright flow #3 passing.
- **M3**: billing integration + audit assertions green; regression suite triggered on release.
