# Learnings from olasunkanmi-SE/restaurant

This note captures concrete takeaways from the public `olasunkanmi-SE/restaurant` repository (NestJS + React, Mongo-backed) and how we can apply them to Nova to close business and technical gaps.

## What the reference system does well
- **Domain + infrastructure segregation:** Separate `domain`, `application`, and `infrastructure` layers plus mappers (for example, dedicated audit mappers) keep persistence concerns isolated from business entities.
- **Order lifecycle instrumentation:** An order-processing queue module persists status changes with audit context, providing a simple pattern for status history and async processing without over-engineering.
- **RBAC-aware operator model:** "Order manager" accounts are validated against the current request context and hashed at creation, aligning role checks with the domain instead of controller glue.
- **Menu/cart primitives:** First-class modules for menu, category, addon, cart, and order notes provide a full flow from catalog → cart → order, which mirrors our portal/POS needs.
- **Front-end cache discipline:** The React frontend leans on TanStack Query with explicit invalidation/mutation guidance to keep derived views fresh after CUD operations.

## How to enhance Nova using these patterns (prioritized)
1. **Persisted order status + audit trail**
   - Add an order-status queue/table to record every POS/payment transition with created-by/modified-by stamps, mirroring the reference queue module. This will improve drill evidence for refunds/captures and simplify troubleshooting across providers.
2. **Unified audit mapper**
   - Introduce a shared audit mapper/service that stamps entities at creation/update/delete across services (payments, loyalty, inventory). Reuse it in API and worker layers to standardize observability and enforcement (e.g., who issued a refund or adjusted loyalty points).
3. **Operator validation at the domain layer**
   - Move RBAC validation into domain services (e.g., POS cashiers, managers) rather than controllers, following the order-manager pattern. This gives clearer permission errors and centralizes password/credential handling before we expand staging roles.
4. **Catalog → cart → order coherence**
   - Align portal/POS flows with the reference catalog/cart modules: ensure modifiers/addons map cleanly into carts, and retain order notes per line item. This reduces bespoke handling in POS quick-sale flows and tightens reporting semantics.
5. **Frontend cache invalidation playbook**
   - Document and implement TanStack Query invalidation patterns for portal mutations (menu edits, inventory counts, refunds, loyalty adjustments) to avoid stale UI when toggling between mock/live APIs.
6. **Contract sharing and smoke tests**
   - Mirror the reference Postman collection approach by generating/sharing HTTP collections for payments/POS/loyalty endpoints and running them as part of staging smoke tests.

## Next steps to operationalize
- Prototype an order-status queue table + service in the API/worker, then surface status history in the portal’s POS refund/capture views.
- Add an audit utility module consumed by payments, loyalty, and inventory services, emitting consistent metadata to logs and DB rows.
- Update portal mutation hooks to share a central cache invalidation helper and add tests to prevent regressions across mock/live modes.
- Publish an auto-generated API collection (OpenAPI → Postman) and wire it into the staging drill workflow alongside the existing billing drill.
