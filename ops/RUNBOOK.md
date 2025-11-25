# Operations Runbook

## Environment Map
| Environment | Purpose | Notes |
|-------------|---------|-------|
| local       | Dev only | Docker Compose (Postgres, Redis, Mailpit) |
| staging     | Pre-prod | Managed Postgres (shared DB), synthetic tenants nightly |
| production  | Planned (on hold) | Deployment rollout paused; stay on staging/Minikube until leadership reopens the environment |

> All operational work must land in local or staging first; treat production procedures as reference only until leadership signals we are ready to re-open that environment.

## Deployments
1. Ensure CI green (lint, typecheck, unit, integration, build, e2e smoke).
2. Tag release via `pnpm release`; CI publishes Docker images (`api`, `worker`).
3. ArgoCD syncs Helm charts (`infra/helm`) once a managed cluster exists; for now apply via Terraform directly to Minikube and skip production cluster work until further notice.
4. Post-deploy verification: `/health`, `/metrics`, worker `/readyz`, POS sale smoke script, background queue depth < 50.
5. Rollback: `argocd app rollback nova-prod <rev>` (future) or rerun Terraform with the previous image tag in staging.
- Production remains paused; when leadership reopens it, follow `ops/PRODUCTION_ROLLOUT_PLAYBOOK.md` for the complete cut-over process.
- Container images publish through GitHub Actions `Release Images` workflow (`.github/workflows/release-images.yml`); run manually via **Run workflow** with a custom tag or push a `v*` git tag. BuildKit layer cache is persisted via GHA cache to accelerate repeat builds.
- Deploy stacks via Terraform/Helm scaffold (`infra/terraform`) using `envs/staging.tfvars`; leave the production overlay staged for the eventual rollout once the team reopens the environment.
- Set `BILLING_WEBHOOK_SECRET` in environment variables before enabling sandbox webhooks; rotate quarterly or if the secret leaks.
- When `PAYMENT_PROVIDER_MODE=sandbox`, run `pnpm dev:payments-sandbox` locally so capture/refund calls leave the API over HTTP and settlement webhooks hit `/v1/portal/pos/payments/:paymentId/status` using `PAYMENT_PROVIDER_WEBHOOK_SECRET`.
- Weekly staging billing drill runs automatically through `.github/workflows/staging-billing-drill.yml`. Maintain the `STAGING_DRILL_ENV` secret (contents mirror `tests/drills/staging.drill.env`), review the uploaded artifact after each run, and log any anomalies in `tests/drills/logs/staging/`. Trigger manually from the GitHub UI (**Actions → Staging Billing Drill → Run workflow**) whenever CLI access (`gh workflow run ...`) is unavailable.
- Use `tests/drills/staging.drill.env.template` as the canonical payload for the secret and run `pnpm drill:check:staging` when you need to confirm the latest staging log is within the seven-day freshness window.

## Monitoring & Alerts
- **Metrics (Prometheus)**:
  - `http_request_duration_seconds{service="api"}` (alert P95 > 750ms for 5m).
  - `bull_queue_jobs_active{queue}` (alert > 200 for 10m).
  - `db_connections_active{tenant}` (alert > 80% pool).
  - `nova_api_billing_webhook_total{status="retrying"}` (alert delta > 5 in 15m) and `{status="failed"}` (alert on any increase).
- Worker HTTP probes (`/healthz`, `/readyz` on port 3001) back Kubernetes liveness/readiness checks; manual spot check with `kubectl port-forward deploy/nova-worker 3001:3001` then `curl http://localhost:3001/readyz`.
- Module toggle telemetry surfaces via `nova_api_superadmin_module_toggle_total{module,enabled}`; dashboard new tenants per module and alert if destructive toggles spike.
- Grafana dashboards live under `infra/monitoring/grafana/`; import `billing-webhook-dashboard.json` to view processed/retry/queue depth trends with linked alert runbooks.
- **Logs (Loki)**: filter by `tenant_id`, `request_id`. Alert on error ratio > 5%/tenant across 10m window.
- **Tracing (OTel ? Jaeger)**: sample 10%; bump to 50% during incidents.
- **Synthetic checks**: UptimeRobot hitting `/health`, `/auth/login`, `/pos/tickets?limit=1` using service account tokens.

## Backups & Restore
- Postgres managed snapshots every 4h; nightly logical dump to `s3://nova-rms-backups` via `pg_dump -Fc`.
- Redis snapshot (RDB) every 30m (mostly cache but retained for replay).
- Tenant export API generates encrypted bundle stored 7 days.
- Monthly restore drill: provision staging clone, restore latest dump, replay outbox, run smoke flows, document outcome in ops journal.
- WAL/PITR: retained 7 days; documented future enhancement for cross-region failover.

## Maintenance Mode
1. Schedule via `POST /support/announcements` + maintenance window entry.
2. Enable feature flag `support.maintenance_mode` (API rejects writes with `MAINTENANCE` error).
3. After maintenance, disable flag, send follow-up announcement, run smoke tests.
4. Record maintenance summary in `ops/MAINTENANCE_LOG.md` (TBD).

## Support Workflow
- Triage tickets in the superadmin console and tag them with severity S1-S4 so you can prioritise quickly.
- For S1 incidents, aim to start mitigation within 15 minutes and close within 2 hours; S2 aim for a 1 hour response, S3 within 4 hours, S4 as time allows.
- Log every response to the support audit table and broadcast announcements if an issue affects multiple tenants; you own the full loop end to end.

## Module Toggle Telemetry & Audit
- Every superadmin module preset change writes to `audit_events` with `module='superadmin'` and `action='registration.module_toggled'`; inspect via `SELECT * FROM audit_events WHERE module='superadmin' AND action='registration.module_toggled' ORDER BY created_at DESC LIMIT 50;`.
- Grafana dashboard target: chart `sum by (module,enabled) (rate(nova_api_superadmin_module_toggle_total[5m]))` to monitor adoption trends; alert on sudden surges in disables.
- When investigating tenant complaints, cross-reference audit payload `delta.toggles` to see previous and current states before replaying API calls.
- Portal analytics hit `/v1/superadmin/analytics/module-toggles?windowDays=30` for the same counts; reuse this endpoint for lightweight dashboards if Prometheus access is constrained.
- Billing summary data lives at `/v1/superadmin/billing/summary`; reuse the upcoming renewal/open invoice arrays for ops dashboards or alerting on rising counts.
- Prometheus gauges `nova_api_billing_*` (active tenants, MRR cents, past due tenants, upcoming renewals, cancel at period end, open invoices) feed Grafana panels and can back alert thresholds.

## Billing Webhooks
- Sandbox events arrive via `/billing/webhooks/sandbox`; ensure `BILLING_WEBHOOK_SECRET` matches the billing sandbox configuration. The API persists payloads to `billing_webhook_events` and enqueues `billing:webhooks` jobs (BullMQ) for the worker.
- Inspect queue health via Bull Board or `pnpm --filter @nova/worker dev` locally; check `nova_api_billing_webhook_total` metrics for retry/failed spikes.
- Inspect `billing_webhook_events` for stuck or failed entries: `SELECT * FROM billing_webhook_events WHERE status IN ('failed', 'pending') ORDER BY created_at DESC;`.
- Audit trail: webhook processing writes `module='billing'` entries with actions `billing.subscription.*` / `billing.invoice.*`; inspect via `SELECT * FROM audit_events WHERE module='billing' ORDER BY created_at DESC LIMIT 100;`.
- Alert definitions live in `infra/monitoring/alerts/billing-webhook-alerts.yaml`; ensure the PrometheusRule is applied in each environment so retry/failure conditions raise notifications.
- To replay a failed event, update `status` back to `'pending'`, clear `last_error`, and requeue with `bullmq` CLI (`node -e "import { Queue } from 'bullmq'; const q = new Queue('billing:webhooks',{connection:{connectionString:process.env.REDIS_URL}}); q.add('process',{ eventId: '<uuid>', eventType: '<type>' },{ jobId: '<uuid>' }).then(()=>q.close());"`). Resubmit payloads through the sandbox endpoint if the original provider expects an HTTP retry.

## Billing Plan Entitlement Drills
- Ensure migration `004_seed_plans_and_entitlements` has been applied (Core/Pro/Enterprise plans). Verify presence with `SELECT name, entitlements FROM plans ORDER BY created_at;` prior to drills.
- Prefer running the automated helper: export the required variables (see `tests/drills/sample.drill.env` for format) then run `pnpm drill:billing` or pass `--env-file`/`--config` to the command. The script prints before/after module/feature snapshots and audit entries.
- Reference configs:
  - Local: `tests/drills/local.drill.env`
  - Staging dry-run (`rms_test`): `tests/drills/staging.drill.env`
  - Production dry-run (`rms_dev`): `tests/drills/production.drill.env`
- Evidence from the latest runs lives under `tests/drills/logs/<env>/YYYYMMDD-HHMMSS.md`; staging logs are current and production entries will resume once the managed environment is online.
- **Manual plan change drill** (if ad-hoc verification needed):
  1. Create a sandbox tenant + subscription using the Core plan (registration flow or direct SQL).
  2. POST a webhook to the API:\
     `curl -X POST "$API_URL/billing/webhooks/sandbox" -H "x-sandbox-signature: $BILLING_WEBHOOK_SECRET" -H "Content-Type: application/json" -d '{"type":"subscription.plan_changed","data":{"subscriptionId":"<sub_uuid>","tenantId":"<tenant_uuid>","planId":"1ef168c5-66e9-4d11-8f51-32301dbce0d4","billingCycle":"monthly"}}'`
  3. Confirm `tenant_modules` / `tenant_feature_flags` updated to match the Pro plan entries (`source='plan'` rows) and audit log contains `billing.subscription.plan_changed`.
- **Cancellation drill**: POST `subscription.canceled` webhook and confirm plan-sourced `tenant_modules`/`tenant_feature_flags` are removed while overrides remain intact.
- **Failure drill**: Temporarily scale the worker to 0, post a webhook, verify `nova_api_billing_webhook_total{status="retrying"}` alerts fire, then restore the worker and ensure backlog drains.
- Document drill outcomes per environment (see `tests/drills/DRILL_REPORT_TEMPLATE.md`) and link dashboards/alert incidents for traceability.


## Incident Response
1. Acknowledge the alert (whether from Grafana, Prometheus, or your synthetic checks).
2. Gather context: dashboards, logs, traces.
3. Mitigate (rollback, scale worker, failover DB) while recording each change.
4. Update the public status page or customer comms every 15 minutes until resolved.
5. Capture a postmortem within 24 hours: root cause, blast radius, follow-up tasks.

## Key Routines
- Daily: check failed jobs, audit anomaly reports, verify backups.
- Weekly: dependency scans, review feature flag overrides, rotate API keys used for integrations.
- Monthly: restore drill, cost review, RBAC review (superadmin members).
- Semiannual: rotate JWT/crypto keys (documented on security calendar).

## Onboarding Checklist for New Env
- Complete Postgres setup assistant steps (`db/README.md`).
- Seed baseline tenant via seed CLI (registration ? approval flow).
- Run `pnpm seed:sample-data -- --tenant-id <id>` (see `docs/SAMPLE_DATA.md`) to populate starter menu/inventory/POS data for demos/tests.
- Run `pnpm test:integration` pointing to env.
- Configure monitoring dashboards + alert routing.
- Perform smoke E2E (Playwright) before opening to users.

## Runbook Quick Commands
- Scale worker: `kubectl scale deploy/nova-worker --replicas=6`.
- Replay event: `pnpm --filter services/worker start --job outbox` (local) or trigger via admin endpoint `/ops/outbox/{id}/retry`.
- Force backup: `kubectl exec nova-backup-job -- pg_dump -U rms_app -d rms_prod -Fc -f /backups/manual.dump`.
- Inspect queue: `kubectl port-forward svc/nova-redis 6379:6379` + `bull-board` UI.

Keep this runbook in sync with operational changes; any deviation requires documentation updates in the next PR.
