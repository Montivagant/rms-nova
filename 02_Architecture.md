# 02_Architecture

## Guiding Principles
- Modular monolith with strict domain boundaries; modules live in packages and services.
- Multi-tenant Postgres with `tenant_id` on every table; composite indexes `(tenant_id, business_key)`.
- REST API under `/v1`; internal events propagated through transactional outbox ? worker bus.
- Background jobs handle heavy/async work (exports, billing sync, notifications).
- Observability baked in: structured logs, metrics, partitioned audit trail, trace hooks.
- Error taxonomy enforced: `VALIDATION`, `AUTHN`, `AUTHZ`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMIT`, `INTERNAL`.

## Runtime Topology
```
clients (portal, POS, superadmin)
   ?
Fastify API (services/api) — auth middleware — tenant resolver — RBAC guard
   ?
Module handlers (packages/* for logic, services/api/routes/* for transport)
   ?
Repositories (Drizzle ORM) ? Postgres (shared db w/ tenant filters)
   ?
    Transactional outbox table ? worker (services/worker) ? background jobs + notifications
```

## Module Boundaries
- **Identity/Tenant Registry**: auth flows, tenant provisioning, user lifecycle, tenant connection profiles.
- **RBAC**: dynamic roles + permission checks driven by `packages/module-registry/module-registry.json`.
- **Module Registry**: canonical modules/features CRUD, feeds RBAC + UI guards.
- **Superadmin Ops**: tenant approval, plan assignment, module toggles, backups, announcements.
- **Billing**: plans, subscriptions, invoicing, webhook ingestion.
- **Support**: tickets, announcements, maintenance windows, tenant feature flags.
- **POS**: tickets, payments, shifts, receipts.
- **Inventory**: items, stock movements, counts, transfers, alerts.
- **Shared Infrastructure**: audit trail, event outbox, notification queue, metrics, logging.

Each module package owns: domain types, service layer, repository functions, validation schemas. Transport layer (API) wires HTTP routes to module service methods. UI apps consume generated OpenAPI clients + shared design system.

## Multi-Tenancy Strategy
- Default shared database; `tenant_id` mandatory in composite primary keys or unique constraints.
- Tenant context resolved from JWT claim `tenant_id`; API rejects requests without tenant scope.
- Sensitive workflows (billing, support) double-check tenant privileges.
- Upgrade path: `tenant_connection_profiles` table stores tenancy mode (`shared`, `schema`, `database`). Worker migrates large tenants to schema-per-tenant or dedicated DB; repository layer looks up connection profile before executing queries.

## Data Model Foundations
- Base tables: `tenants`, `users`, `roles`, `role_permissions`, `user_roles`, `module_registry_entries`, `tenant_modules`, `tenant_feature_flags`.
- Audit: append-only `audit_events` partitioned monthly (range partition on `created_at`).
- Event outbox: `event_outbox` with statuses `pending`, `dispatched`, `failed`; worker polls with backoff.
- Soft delete via `deleted_at` where needed; filtered indexes exclude soft-deleted rows.
- All timestamps UTC; use `TIMESTAMPTZ`.

## Internal Events
- Modules publish domain events (`pos.ticket.settled`, `inventory.stock.adjusted`, `billing.subscription.updated`).
- Event payload includes `{ event_id, tenant_id, entity_id, version, occurred_at, data }` to guarantee idempotency.
- Worker consumes events to trigger cross-module actions (inventory deduction from POS sale) and notifications.

## API Surface (`/v1`)
- Namespaced routers per module (`/v1/auth`, `/v1/tenants`, `/v1/rbac`, `/v1/module-registry`, `/v1/superadmin`, `/v1/billing`, `/v1/support`, `/v1/pos`, `/v1/inventory`).
- All routes validate input via Zod schemas derived from OpenAPI.
- Response wrapper: `{ data, pagination? }` on success, `{ error: { code, message, details? } }` on failure.
- Rate limiting per tenant + IP; configurable guard rails.

## Background Jobs
- Queue: BullMQ on Redis.
- Job categories: `outbox-dispatch`, `email-send`, `report-export`, `backup-run`, `billing-webhook-retry`.
- Jobs are idempotent; use dedupe keys combining `tenant_id` and business key.
- Worker exposes health metrics (active, failed, retry counts).

## Observability
- Logging: Pino JSON with `tenant_id`, `request_id`, `user_id`, `module`, `action`.
- Metrics: Prometheus via `@fastify/metrics`; custom gauges for queue depth, DB connections.
- Tracing: OpenTelemetry instrumentation for Fastify, Postgres, BullMQ.
- Audit: every mutation writes to `audit_events` with diff payload.

## Error Handling
- Shared error helpers map domain errors to taxonomy codes and HTTP status (e.g., `AUTHZ` ? 403).
- Errors bubble through Fastify error handler logging structured context.
- Worker jobs log with correlation ids referencing outbox event.

## Deployment Workflow
- `pnpm` workspace orchestrates builds.
- CI (GitHub Actions) runs lint ? typecheck ? unit ? integration ? build ? publish preview.
- Docker images per service; `docker-compose.dev.yml` for local dev (API + worker + Postgres + Redis).
- Production via Kubernetes (Helm charts stored under `infra/helm`).

## Upgrade Path & Service Extraction
- Monitor module metrics; when isolating, reuse same OpenAPI + message contracts.
- Migration plan: move module tables into dedicated schema, expose service behind API gateway, relocate event outbox to Kafka if needed.

## Security & Compliance
- JWT access/refresh, optional tenant-scoped API keys.
- MFA optional in Identity module.
- PII encryption via Postgres `pgcrypto` for sensitive columns (e.g., customer contact).
- Strict least-privilege DB roles (app role limited to tenant data).

## Testing Strategy (M0 baseline)
- Unit tests for error helpers, RBAC checker, validators.
- Integration tests for health, signup?approval, module toggle, POS sale, inventory deduction.
- Smoke E2E hitting deployed `/health` and key flows via Playwright.

## Deliverable Milestones
- **M0** Platform & Guardrails: DB scaffolding, logging, metrics, design tokens, pipeline, Postgres setup assistant.
- **M1** Identity + Tenant Registry + RBAC + Module Registry: public registration, approval, dynamic roles, UI guards.
- **M2** Superadmin Console: tenant ops, module toggles, backups/export, announcements, support inbox.
- **M3** Billing & Plans: plan management, sandbox payments, entitlements, audit.
- **M4-M8** Business Modules: POS ? Inventory ? Menu ? Orders/KDS ? Reporting.
