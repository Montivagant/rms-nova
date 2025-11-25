# Nova RMS – Immediate Action Plan

This plan consolidates the current repository state and the next execution steps to keep the local/staging-first posture on track while avoiding unnecessary scope. See the detailed, code-first breakdown in `docs/EXECUTION_PLAN.md` for per-module tasks and evidence expectations.

## Where We Stand (snapshot)
(See also: `docs/EXECUTION_PLAN.md` for the ordered, staging-first delivery plan that operationalizes the items below.)
- **Portal coverage**: Menu/inventory/POS/payments/reporting/locations/account flows are live with RBAC/module-aware routing and deterministic fallbacks for mock API usage.
- **Payments + POS**: Quick-sale creation and refunds are wired to persist processor metadata and expose inline refund controls; sandbox HTTP capture/refund + webhook flows exist, with real-provider mode gated behind environment variables.
- **Loyalty**: Schema, APIs (`/overview`, `/:accountId`, `earn`, `redeem`), deterministic seed data, and the portal workspace ship with POS hooks for accrual/refund deductions.
- **Infrastructure**: Terraform/Helm overlays deploy the API/worker to Minikube staging; production overlays remain frozen until staging is complete; billing drills for staging are current.
- **Testing posture**: Lint/typecheck/unit/integration/e2e paths are green locally; Playwright portal suite runs against the mock API with a switch to target live hosts.

## Gaps to Close Immediately (result-oriented)
1. **Payments/Provider hardening**
   - Add richer sandbox metrics/alerts and retry paths for settlement webhooks.
   - Finish provider-backed capture/refund flows with failure handling beyond the deterministic mock.
   - Capture evidence via staging drills (POS/payments) alongside the existing billing drill cadence.
2. **Loyalty completion**
   - Implement expiration logic, deeper POS hooks, and drills/tests for accrual/redemption edge cases.
   - Ensure module defaults/permissions stay aligned as portal and POS UX expand.
3. **Inventory reconciliation polish**
   - Expand attachment handling (multi-file bundles/previews) and export packaging for ops evidence.
4. **Playwright coverage expansion**
   - Add live + mock scenarios for account edits, inventory counts, POS sale/refund, and menu create/edit/modifier flows.
5. **Infra & release hygiene**
   - Keep Terraform/Helm/runbooks synced with any new provider/storage env vars.
   - Maintain the staging-first freeze, but keep production overlays ready to re-enable once gates clear.
6. **POS guardrails from new benchmarks**
   - Enforce POS Opening/Closing gating with table attention timers before any table actions (URY pattern) so settlements/refunds tie back to an open shift.
   - Add a status-bucketed order log with reprint/payment/cancel affordances plus multi-channel KDS/printing fallbacks (QZ/network/websocket) to avoid dead-ends during staging pilots.
   - Stand up a guest-facing marketing/menu microsite (smart-pos pattern) and ensure portal theming/locale hooks (TastyIgniter pattern) exist before production hardening.

## Execution Order (near-term)
1. Payments/provider hardening (API + worker + portal UX), then stage billing/POS drills.
2. Loyalty expiration + drills while keeping POS hooks and module defaults in sync.
3. Inventory evidence UX updates.
4. Playwright coverage for all write paths (mock/live toggles).
5. Infra/runbook updates tied to new env vars/secrets introduced above.

## Definition of Done for this cycle
- Staging stack exercises real-ish payment flows (sandbox/provider) with metrics/alerts and drill evidence.
- Loyalty expiration logic validated via tests and drills; portal/POS reflect balances accurately.
- Inventory reconciliation delivers downloadable evidence bundles and inline previews.
- Playwright suites cover the listed write paths in mock + live modes.
- Terraform/Helm/runbooks updated for any new configuration introduced in this cycle.
