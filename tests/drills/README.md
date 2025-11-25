# Operational Drills

This directory contains automation and guides for running operational readiness drills.

- `BILLING_PLAN_DRILL.md` - detailed steps (automation + manual) for the billing plan entitlement drill.
- `DRILL_REPORT_TEMPLATE.md` - template for recording drill evidence.
- `run-billing-plan-drill.ts` - executable script invoked via `pnpm drill:billing`.

## Usage

```bash
# Ensure environment variables are set (see BILLING_PLAN_DRILL.md)
pnpm drill:billing

# Or load values from a file
pnpm drill:billing --env-file ./tests/drills/sample.drill.env
# Staging template (rms_test): tests/drills/staging.drill.env
# Production template placeholder (rms_dev): tests/drills/production.drill.env
#   (kept for future use once a managed production cluster exists)
pnpm drill:billing --config ./tests/drills/dev-drill.json
```

After the drill, fill out the report template and archive it under `tests/drills/logs/<env>/<timestamp>.md` or the environment-specific ops journal (latest runs captured under `logs/local`, `logs/staging`; production logs will resume once the environment exists).

> **Cadence:** Run the staging drill (`pnpm drill:billing --env-file tests/drills/staging.drill.env`) at least weekly and after every staging deployment so the queue/entitlement pipeline evidence stays fresh while production remains paused.

## Automation

- The scheduled GitHub Actions workflow `.github/workflows/staging-billing-drill.yml` executes the staging drill every Monday at 09:00 UTC (and on demand via manual dispatch). It expects a repository secret `STAGING_DRILL_ENV` containing the contents of `tests/drills/staging.drill.env`.
- Each run writes the console output to `tests/drills/logs/staging/<timestamp>.md` and uploads the log as a workflow artifact. Review the artifact after every run and follow up on failures immediately.
- Use `tests/drills/staging.drill.env.template` as the starting point for the secret payload; replace the placeholder values with current staging credentials before populating `STAGING_DRILL_ENV`.
- To confirm the cadence manually, run `pnpm drill:check:staging` (alias for `pnpm tsx tests/drills/check-staging-drill.ts`); the script ensures the newest staging log is not older than seven days (override via `DRILL_FRESHNESS_DAYS`).
