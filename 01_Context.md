# 01_Context

## Business Scope
- POS: tickets, modifiers, multi-tender payments, refunds, receipt delivery
- Inventory: items, categories, stock levels, transfers, cycle counts, low-stock alerts
- Menu: categories, items, modifiers, recipes, pricing, tax rules, location overrides
- Orders/KDS: kitchen queue, status workflow, timing, routing
- Reporting: sales, inventory deltas, staff performance, exports
- Identity/RBAC: tenants, users, invite flows, dynamic roles, preview-as-role
- Loyalty: customers, points accrual/redemption, visit history

## Legacy Pitfalls to Avoid
- Single-bundle SPA causing slow builds and tangled dependencies
- Offline-first sync (PouchDB) introducing data drift and conflict storms
- Frontend event-sourcing coupling UI to persistence details
- Lack of authoritative backend API and shared contracts
- Cross-domain imports creating change ripple effects
- Untyped payloads breaking backward compatibility
- Test suite reliant on mocks; flaky and low-signal
- Monolithic deployment limiting targeted scaling

## Proven Remedies
- Modular monolith with strict domain packaging and shared services
- Server-first API with optional offline queue replay
- Multi-tenant Postgres, tenant_id everywhere, composite indexes
- Internal event bus with outbox, not UI event sourcing
- OpenAPI/Zod contracts shared across client/server
- Real DB-backed tests (unit, integration, E2E) without mocks
- pnpm workspace for isolated builds, shared tooling
- Structured logging, partitioned audit trail, baseline metrics

## Non-Negotiables
- Dynamic RBAC from module registry; enforced in API and UI layers
- Design system primitives only; zero inline styling
- Idempotent writes, short transactions, heavy work offloaded to jobs
- Observability baked in: logs, metrics, audit, tracing hooks
- Testing pyramid: deterministic unit/integration/E2E with real flows
- Postgres setup assistant guiding roles/DBs/backups for every env
