# Local/Staging Completion Plan

Nova RMS must deliver a feature-complete experience in local + Minikube staging before production reopens. This plan combines the current gap analysis with the roadmap in `TODO.md`, `docs/STATUS.md`, and the latest PROGRESS entries to outline every workstream required to finish the system.

## Scope & Definition of Done
- **Tenancy & RBAC**: Registration, approval, login, dynamic roles, module toggles, preview-as-role UX.
- **Superadmin Console**: Tenant/module/billing management, support tooling, evidence capture, backups/exports.
- **Customer Portal**: Dashboard, menu, inventory, assignments, POS, payments, reporting, locations, account, loyalty.
- **Operations**: Billing drills, Terraform/Helm overlays, observability, docs/runbooks.
- **Testing**: Deterministic seeding, Vitest type/unit/integration suites, Playwright coverage (mock + live APIs), drills.
- **Data & Integrations**: POS ticket lifecycle, payment sandbox integration, loyalty accrual/redemption, inventory reconciliation.

## Gaps Identified
1. **POS & Payments** (TODO #17): Quick-sale API + refunds and payment metadata are live, but there is no sandbox provider integration (capture/settle/retry), provider-backed refunds, receipt delivery, or payment-state UI.
2. **Loyalty Module** (TODO #18): Schema + module registry defaults exist, and the first `/v1/portal/loyalty/**` accrual/redemption APIs now ship with deterministic seed data/tests. Portal/POS UI, expiration logic, drills, and provider hooks are still pending.
3. **Inventory Reconciliation**: Count sessions and portal UI now sync live stock levels and expose CSV exports, but attachments and richer reconciliation evidence (per-location artifacts) are still missing.
4. **Portal Coverage & UX**: Menu/inventory/POS/account flows hit real APIs, but payment-state UX, loyalty surfaces, reconciliation evidence, and richer guidance are missing.
5. **Playwright Coverage**: Only smoke flows; need write-path tests (account, inventory, menu, POS, loyalty).
6. **Support/Backups in Superadmin**: UI wiring + APIs pending.
7. **Automation**: Auto-migration for tests is live, but staging pipeline still manual; portal Playwright suite only tests mock flows (no live-mode runs).

## Workstreams & Tasks

### A. Data & Migrations
| Task | Description | Deliverables |
| --- | --- | --- |
| Payment Provider Artifacts | HTTP sandbox + webhook pipeline now exist (`pnpm dev:payments-sandbox`); keep instrumenting provider ids/state + receipt hooks so capture/refund flows stay auditable across environments. | Migration + ERD update + docs. |
| Loyalty Data | Schema delivered (`011_loyalty`); add seed data and any follow-on columns needed for accrual/expiration configs. | Seed updates + docs, module registry verification. |
| Inventory Reconciliation | Evidence attachments + CSV exports now land with each count session; next steps cover richer packaging (bulk downloads/PDF summaries) and attachment governance within drills. | Portal/API polish, docs updates, drill procedures. |
| Seed Enhancements | Update `scripts/seed-sample-data.ts` to populate loyalty balances, POS tickets with tenders/provider metadata, inventory counts. | Deterministic dataset + docs/SAMPLE_DATA refresh. |

### B. API & Service Layer
| Module | Tasks | Success Criteria |
| --- | --- | --- |
| POS Tickets | Quick-sale + refund endpoints exist and the portal payments table now surfaces inline refund controls; add capture/settle/retry against a payment sandbox, receipt delivery, and inventory/audit hooks that reflect provider outcomes. | Vitest coverage, RBAC/module enforcement, inventory deduction, audit logs, provider-backed status. |
| Payments Integration | Add sandbox payment provider client (mock + real), background polling for statuses, webhooks/resync jobs, module toggle controls. | Billing/Payments docs, worker jobs, metrics, drill script. |
| Loyalty | Services for accrual, redemption, expiration; portal APIs for balances/history; superadmin toggles. | Accrual + redemption APIs/tests and the portal `/loyalty` workspace have shipped; quick-sale tickets + refunds now award/deduct loyalty points automatically. Next step covers expiration logic, deeper POS hooks, and drill automation. |
| Inventory Counts | Sessions + adjustments are live; keep evolving the attachment workflow (tagging, bulk downloads, inline previews) so reconciliations remain audit-ready. | Fastify follow-ups, portal UI, docs/tests. |
| Support/Backups | Superadmin endpoints for support inbox, file exports, backup triggers; integrate with audit + metrics. | APIs with coverage + docs. |

### C. Portal & Superadmin Frontends
| Area | Actions |
| --- | --- |
| Portal POS | Add provider-backed payment states, tender selection UX, receipt download, and retries tied to worker signals. |
| Portal Payments | Surface real payment statuses/settlements from the provider-backed APIs; allow replays/refunds with RBAC guardrails. |
| Portal Loyalty | Add loyalty summary, transaction history, accrual/redemption forms; respect module toggle. |
| Inventory Reconciliation UI | Introduce count session wizard, attachment uploads, export buttons, error handling. |
| Portal Playwright Coverage | Add specs for account profile update, inventory counts/reconciliation, POS sale/refund, menu create/edit/modifiers, loyalty redemption, payment retry in both mock and live modes. |
| Superadmin Support | Build inbox, ticket triage, exports, and backups UX using existing design-system primitives. |
| Nav/Guardrails | Ensure module toggles + RBAC drive nav visibility, server actions, and caching for every new feature. |

### D. Testing & Quality Gates
1. **Unit/Integration**: Expand Vitest suites to cover new routes, payments client, loyalty math, inventory counts.
2. **Playwright**:
   - Superadmin: Add support and module toggle flows to smoke suite.
   - Portal: Expand to cover all write paths (mock + live). Add `PLAYWRIGHT_PORTAL_API_MODE=live` pipeline using local API.
3. **Mock API**: Update `tests/e2e/portal/mock-api-server.ts` to mirror new routes so mock mode stays deterministic.
4. **Drills**: Extend `tests/drills` with POS/payments/loyalty scripts; capture evidence logs.
5. **CI Enhancements**: Add optional `pnpm db:migrate` check for staging, run Playwright portal suite in CI nightly (mock + live).

### E. Operations & Observability
| Task | Description |
| --- | --- |
| Metrics | Add Prometheus counters/gauges for POS tickets, payment attempts, loyalty transactions, inventory counts. |
| Alerts | Update Grafana/Prometheus rules for new queues/endpoints. |
| Terraform/Helm | Ensure new env vars/secrets for payment provider, storage, loyalty. |
| Docs | Update ops runbooks, STATUS, TODO, README, ENVIRONMENT_SETUP after each milestone. |
| Billing/Loyalty Drills | Document runbooks for POS payment drill and loyalty reconciliation, schedule staging runs. |

### F. Staging Validation
1. **End-to-End Dry Runs**: Signup -> approval -> portal onboarding -> menu/inventory setup -> POS sale -> payment settlement -> loyalty accrual/redeem -> reporting/export.
2. **Portal vs Superadmin Parity**: Confirm module toggles, support actions, plan changes propagate between consoles.
3. **Evidence Capture**: Update `tests/drills/logs/staging/*.md` after each major drill.
4. **Readiness Checklist**: Maintain living checklist in `docs/STATUS.md` and `TODO.md` marking each capability green once local + staging verification is done.

## Execution Order
1. **Data & API Foundations** (Workstreams A + B for POS/payments/inventory counts).
2. **Portal/Superadmin UI + Playwright** (Workstream C + D).
3. **Loyalty Implementation** (Workstreams A/B/C for loyalty).
4. **Operations Hardening** (Workstream E).
5. **Staging Drill & Sign-off** (Workstream F).

Each workstream should land behind feature flags/module toggles, ensuring mock-data fallbacks continue working until the real API paths are validated.
