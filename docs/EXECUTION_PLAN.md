# Nova RMS – Ordered Execution Plan (staging-first)

This plan sequences the open action items from the recent repository benchmarks into an achievable, staging-first track. It keeps scope tight (no redundancy/over-engineering) while ensuring docs stay current and business gaps are closed before production.

## Guiding constraints
- **One-operator cadence:** Single owner, so prioritize serializable chunks with fast feedback.
- **Staging-first freeze:** All work verified locally/staging before production overlays unfreeze.
- **Result-orientation:** Each step yields a demonstrable artifact (code, drill evidence, or test coverage).
- **Re-use + lightweight:** Prefer configuration and shared utilities over parallel implementations.

## Ordered workstream
1. **POS shift gating + table discipline (URY pattern)**
   - Implement open/close shift checks blocking table and payment actions; add table attention timers.
   - Surface a status-bucketed order log with reprint/payment/cancel; wire printing/KDS abstraction with websocket fallback.
   - Deliverable: POS UI + API enforcement, drill script for shift lifecycle, and printing fallback demo on staging.
2. **Payments/provider hardening**
   - Add retry/alerting for sandbox webhooks; finish provider-backed capture/refund with failure handling beyond mock.
   - Record status transitions in the order-status queue with audit stamps (from restaurant repo learning).
   - Deliverable: Provider flows exercised in staging drill evidence with metrics hooks noted in runbooks.
3. **Loyalty expiration + POS hooks**
   - Implement expiration policy, accrual/refund edge cases, and POS balance reflections; align module defaults/RBAC in domain layer.
   - Deliverable: Tests + drill evidence for earn/redeem/expire; RBAC validation at domain services.
4. **Inventory reconciliation polish**
   - Add multi-file attachment bundles with previews and export packaging for ops evidence.
   - Deliverable: Portal UX update + downloadable evidence bundle; updated runbook for reconciliation steps.
5. **Guest-facing marketing/menu microsite (smart-pos split)**
   - Stand up static/Next-based microsite backed by shared content API; add theming/locale hooks (TastyIgniter pattern).
   - Deliverable: Deployed staging microsite with shared tokens, documented linkage to portal content.
6. **Playwright coverage expansion**
   - Add mock/live scenarios for account edit, inventory counts, POS sale/refund, menu create/edit/modifier flows; assert cache invalidation patterns (TanStack discipline).
   - Deliverable: Passing Playwright suites in CI, tagged for mock vs live targets.
7. **Infra/runbook synchronization**
   - Propagate new env vars/secrets (provider, printing/KDS, microsite) into Terraform/Helm and ops runbooks; keep production overlays parked until gates pass.
   - Deliverable: Updated infra manifests and runbooks with validation checklist.

## Detailed task breakdown (staging-first, code-first)
### 1) POS shift gating + order log/printing
- **API/domain**: Add shift state guards in `services/pos` transaction handlers; reject table open/close/payment outside an open shift and log audit reasons.
- **Portal POS UI**: In `apps/portal`, gate table actions behind shift status, add timers for stale tables, and expose status-bucketed order log with reprint/payment/cancel actions.
- **Printing/KDS abstraction**: Extend printing service with websocket/network fallback (QZ + HTTP) and KDS-compatible payload mapper; document env toggles.
- **Testing/evidence**: Unit tests for shift guardrails; a staging drill script that opens/closes shifts, exercises reprint/cancel, and captures fallback demo; update `ops/RUNBOOK.md` with the flow.

### 2) Payments/provider hardening
- **Webhook reliability**: Add retry/backoff + DLQ for sandbox/provider webhooks in worker; emit metrics/alerts (Prometheus counters) and log correlation IDs.
- **Capture/refund flow**: Implement provider-backed capture/refund with status-queue writes and unified audit metadata; ensure idempotency keys on retries.
- **Portal UX**: Expose refund/capture states and errors inline in POS/portal; show reconciliation links.
- **Testing/evidence**: Staging drill covering create → capture → refund → webhook retry; extend billing drill logs in `tests/drills/logs/` and cite in `ops/RUNBOOK.md`.

### 3) Loyalty expiration + POS hooks
- **Domain logic**: Implement accrual/redemption/expiration rules with grace windows and provider-neutral timestamps; ensure RBAC checks in domain services.
- **POS/portal**: Show balance/expiration in POS tender selection and portal account view; block redemption on expired balances with actionable messaging.
- **Testing/evidence**: Unit/integration cases for earn/redeem/expire; Playwright path for redeem + expire; drill notes proving expiry sweep in staging.

### 4) Inventory reconciliation polish
- **Attachments**: Support multi-file upload with preview cards and download bundles in portal (`apps/portal` inventory module); persist metadata in API.
- **Exports**: Add CSV/PDF export packaging for reconciliation evidence with signed URLs; include checksum for audit.
- **Testing/evidence**: UI integration test for multi-upload + export; staging runbook entry showing download and checksum verification.

### 5) Guest-facing microsite
- **App**: Create Next-based microsite (new `apps/microsite`) backed by shared content/menu API; add theming/locale toggles and SEO meta.
- **Content pipeline**: Reuse design-system tokens; wire to menu/catalog endpoints with cache invalidation on publish.
- **Testing/evidence**: Lighthouse/axe snapshot; deployment to staging with link from portal; runbook note for publish workflow.

### 6) Playwright coverage expansion
- **Scenarios**: Add mock/live flows for account edit, inventory count, POS sale/refund, menu create/edit/modifier; assert TanStack cache invalidation (queries refetched/invalidated).
- **Tagging**: Keep suites tagged for `mock` vs `live` and wire to CI matrix; ensure deterministic seeds are loaded.
- **Testing/evidence**: Green Playwright runs in CI; attach artifacts/screenshots; document command matrix in `tests/TESTPLAN.md`.

### 7) Infra/runbook synchronization
- **Config propagation**: Add new env vars/secrets (provider keys, printing/KDS endpoints, microsite URLs) to Terraform/Helm overlays; align `compose.env` for local.
- **Observability**: Ensure alert rules/dashboards cover webhook retries, print/KDS failures, and loyalty expirations; version them under `infra/monitoring`.
- **Runbooks**: Update `ops/RUNBOOK.md` and `ops/PRODUCTION_ROLLOUT_PLAYBOOK.md` with validation checklists and fallback steps before unfreezing production overlays.

## Cadence and dependencies
- **Week 1:** Finish POS shift gating/order log/printing fallback (1) → unblock payment/provider hardening (2) because settlements tie to shifts.
- **Week 2:** Payments/provider hardening (2) + loyalty expiration hooks (3) in parallel where possible; ship initial Playwright coverage for POS sale/refund to guard regressions.
- **Week 3:** Inventory polish (4) + guest microsite (5) to close evidence gaps and public surface; extend Playwright to menu/inventory flows (6).
- **Week 4:** Infra/runbook sync (7) and final drill passes across payments/POS/loyalty before lifting production freeze.

## Definition of done (per workstream)
- **POS gating/printing:** Shift lifecycle enforced in API/portal, order-log UX live, websocket printing fallback demonstrated in staging drill notes.
- **Payments/provider:** Sandbox + provider captures/refunds succeed with retries/alerts; status queue persists audited transitions; drill evidence captured.
- **Loyalty:** Expiration logic with tests/drills; POS and portal show accurate balances; domain-layer RBAC enforced.
- **Inventory:** Attachments preview + export bundle downloadable; reconciliation steps documented.
- **Microsite:** Staging marketing/menu site reading shared content API with theme/locale hooks; deployment documented.
- **Playwright:** Suites cover mock/live write paths and assert cache invalidation behaviors; green in CI.
- **Infra/runbooks:** Terraform/Helm and ops docs reflect new configs, with checklists for staging sign-off and production readiness.
