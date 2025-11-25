# Billing Plan Drill Report Template

Use this template to capture drill evidence per environment. Store completed reports in ``tests/drills/logs/<environment>/<timestamp>.md`` or the environment's ops journal.

## Environment
- Name:
- Date/Time:
- Operator:

## Preconditions
- Migration `004_seed_plans_and_entitlements` applied? (Y/N)
- Tenant ID:
- Subscription ID:
- Starting plan:

## Execution Summary
1. Command run (`pnpm drill:billing` or manual steps):
2. Notes on configuration (env vars, overrides):

## Observations
- Plan change snapshot (modules + feature flags):
  ```
  (Paste console table output)
  ```
- Cancellation snapshot:
  ```
  (Paste console table output)
  ```
- Audit entries:
  ```
  (Paste audit JSON output)
  ```

## Metrics & Alerts
- Grafana panels reviewed (links/screenshots):
- Prometheus/Alertmanager notifications (IDs, timestamps):
- Direct outreach or customer updates (if any):

## Issues & Actions
- Unexpected behaviour?
- Follow-up tasks:

## Verification
- Confirmation noted by:
- Date of sign-off:
