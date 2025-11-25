# Production Rollout Playbook *(Deferred)*

> Production remains intentionally paused until the local + Minikube staging stack proves the full workflow. Treat this playbook as the agreed-upon process for the future cut-over. Do **not** run production commands until leadership authorizes the rollout.

## 1. Readiness Gate
1. **Staging health**
   - Latest staging deployment running via `terraform apply -var-file=envs/staging.tfvars`.
   - Coverage gates green (60/50/70/60) and smoke E2E passing.
   - Billing drill workflow fresh (`pnpm drill:check:staging` ? newest log < 7 days).
2. **Operational artifacts**
   - Sample data seeded (`pnpm seed:sample-data`) for demo tenants.
   - Runbooks, STATUS, and TODO updated for launch scope.
3. **Access & quotas**
   - Managed Kubernetes cluster provisioned (GKE/AKS/EKS) with kubeconfig distributed.
   - Registry (GHCR/GCR) credentials validated for pushing release images.

Record evidence from the above in `tests/drills/logs/production/<timestamp>-preflight.md`.

## 2. Change Freeze & Communication
1. Announce release window + freeze start in `#nova-dev` and `#nova-ops`.
2. Lock main branch; only hotfix PRs allowed (requires incident commander approval).
3. Prep stakeholder comms (status page, customer email template, incident room link).

## 3. Build & Publish Release Artifacts
1. Tag the release: `pnpm release` (generates `vX.Y.Z` tag and changelog).
2. Trigger `.github/workflows/release-images.yml` (or run locally):
   ```powershell
   docker build -t gcr.io/rms-nova/nova-rms-api:production -f services/api/Dockerfile .
   docker build -t gcr.io/rms-nova/nova-rms-worker:production -f services/worker/Dockerfile .
   docker push gcr.io/rms-nova/nova-rms-api:production
   docker push gcr.io/rms-nova/nova-rms-worker:production
   ```
3. Verify image digests match the EXPECTED ones in infra docs; update `infra/helm/nova-stack/values-production.yaml` with the new tag/digest pair.

## 4. Pre-Apply Checklist
1. Ensure production secrets exist (`kubectl apply -f infra/k8s/secrets/production-secrets.yaml` or secret manager equivalent).
2. Confirm Terraform variable file `infra/terraform/envs/production.tfvars` references:
   - `image_registry` + `image_tag`
   - Proper `kubeconfig_path` / `kubeconfig_context`
   - Replica counts + autoscaling hints
3. Validate database migrations are backed up (logical dump!) and that `pnpm --filter @nova/api db:migrate` ran against a clone.
4. Pause scheduled jobs (staging billing drill, cron pipelines) if they could target production resources accidentally.

## 5. Apply Production Infrastructure
1. From `infra/terraform`:
   ```powershell
   terraform init
   terraform plan -var-file=envs/production.tfvars
   terraform apply -var-file=envs/production.tfvars
   ```
2. Watch the Helm release rollout (`kubectl -n nova-prod get pods -w`).
3. For each deployment, confirm readiness probes succeed (`kubectl -n nova-prod describe pod ...`).

## 6. Post-Deployment Verification
1. API probes:
   ```powershell
   curl https://api.prod.example.com/v1/health
   curl https://api.prod.example.com/v1/metrics
   ```
2. Worker:
   ```powershell
   kubectl -n nova-prod port-forward deploy/nova-worker 9001:3001
   curl http://localhost:9001/readyz
   ```
3. Synthetic flows:
   - Run `pnpm test:e2e --project=chromium` against production base URL (read-only accounts).
   - Execute billing drill dry-run with production env file (`pnpm drill:billing --env-file tests/drills/production.drill.env`).
4. Observability:
   - Grafana dashboards show traffic, module toggles, billing metrics.
   - Alertmanager quiet (no firing alerts).

Capture logs, screenshots, and drill outputs in `tests/drills/logs/production/<timestamp>-launch.md`.

## 7. Rollback Plan
1. Immediate rollback is `terraform apply` with previous image tag or `kubectl rollout undo deploy/<name>`.
2. Database changes are forward-only; for fatal issues, restore from the latest logical dump and re-run migrations.
3. Communicate rollback in all channels; once stabilized, create a postmortem entry (template in ops runbook).

## 8. Post-Launch
1. Lift code freeze, announce success/failure summary, and link artifacts.
2. Schedule follow-up drills (billing, backups, failover) within 7 days.
3. Update STATUS/TODO/README to reflect production state.

---

**Reminder:** Until staging sign-off and leadership approval happen, this document is reference material. Do not execute production commands in advance.
