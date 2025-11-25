# Environment & Deployment Notes

## Container Registry
> **Currently staging-only:** Production infrastructure is intentionally paused while we operate in Minikube staging/local environments. Keep quota requests and managed-cluster build-out on hold; steps referencing production tags or Terraform overlays remain documented for the eventual rollout and should not run until staging is fully validated.
- **Local images**: `nova-rms-api` / `nova-rms-worker` currently built on the workstation; tag and push to your registry (Docker Hub, GHCR, ECR, etc.) before production use.
- **Minikube base image**: `gcr.io/k8s-minikube/kicbase:v0.0.48` (`sha256:7171c97a51623558720f8e5878e4f4637da093e2f2ed589997bedc6c1549b2b1`) runs the Minikube control plane.

## CLI prerequisites
- Run `pwsh tools/install-tools.ps1` (or copy the commands inside) to download Helm/Terraform into `tools/`. The binaries are intentionally excluded from git history; rerun the script whenever you need to bump versions.

## Local databases without Docker
If Docker isn’t available (e.g., Codex Universal container), provision Postgres + Redis directly on Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib redis-server
sudo service postgresql start
sudo service redis-server start

sudo -u postgres psql <<'SQL'
CREATE ROLE rms_app WITH LOGIN PASSWORD 'Owner@123' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE rms_app SET client_encoding TO 'UTF8';
ALTER ROLE rms_app SET timezone TO 'UTC';
CREATE DATABASE rms_dev OWNER rms_app;
CREATE DATABASE rms_test OWNER rms_app;
SQL
```

Export the expected environment variables (if they are not already configured in your Codex environment):

```bash
export DATABASE_URL=postgres://rms_app:Owner@123@localhost:5432/rms_dev
export TEST_DATABASE_URL=postgres://rms_app:Owner@123@localhost:5432/rms_test
export REDIS_URL=redis://localhost:6379
export BILLING_WEBHOOK_QUEUE_NAME=billing-webhooks
export PAYMENT_STATUS_QUEUE_NAME=payment-status
```

Run `pnpm --filter @nova/api db:migrate` to prime the schema, then `pnpm dev:stack` to launch API/worker/portals.

## Minikube Container
- **Name**: `minikube`
- **Ports** (container -> host):
  - `22/tcp` -> `127.0.0.1:54298`
  - `2376/tcp` -> `127.0.0.1:54295`
  - `32443/tcp` -> `127.0.0.1:54296`
  - `5000/tcp` -> `127.0.0.1:54299`
  - `8443/tcp` -> `127.0.0.1:54297`
- **Network**:
  - Network name: `minikube`
  - Gateway: `192.168.49.1`
  - Node IP: `192.168.49.2`
  - Subnet prefix: `/24`
## Service Endpoints (local)
- **Postgres**: `postgres://root:root@localhost:5432/` (container host mapping); service URLs used in app configs:
  - Dev: `postgres://rms_app:Owner%40123@postgres:5432/rms_dev`
  - Test: `postgres://rms_app:Owner%40123@postgres:5432/rms_test`
  - Prod: `postgres://rms_app:Owner%40123@postgres:5432/rms_prod`
- **Redis**: `redis://redis:6379` (mapped to `localhost:6379`).
- **API**: `http://localhost:3000` (`API_URL=http://localhost:3000/v1`).
- **Worker Health**: `http://localhost:3001/healthz` and `/readyz` (defaults from `WORKER_HEALTH_HOST`/`WORKER_HEALTH_PORT`; probes surface queue/DB readiness for Kubernetes).
- **Local dev shortcut**: `pnpm dev:backend` runs the API and worker together; add `pnpm dev:superadmin` (or `pnpm dev:stack`) when you need the portal too.

## Environment Files & Secrets
1. Duplicate `.env.example` to `.env` at the repo root and fill in:
   - `DATABASE_URL`, `TEST_DATABASE_URL`, `PROD_DATABASE_URL` (Postgres targets above).
   - `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `ENCRYPTION_KEY`, `BILLING_WEBHOOK_SECRET`, `SUPPORT_EMAIL`, and any provider keys you need locally.
   - Use the same `.env` for the API and worker (they both read from the root).
2. Create `.env.local` files per Next.js app:
   - `apps/portal/.env.local` must include `PORTAL_API_BASE_URL=http://localhost:3000` (and optional overrides such as `PORTAL_ACCESS_TOKEN` / `NEXT_PUBLIC_PORTAL_ACCESS_TOKEN` for automation).
   - `apps/superadmin/.env.local` can override `API_BASE_URL=http://localhost:3000` plus `NEXT_PUBLIC_SUPERADMIN_BEARER` when bypassing login in local dev.
3. When using Docker Compose, copy `compose.env` and wire any overrides you need before launching the stack; Terraform/Helm overlays pull their secrets from `infra/terraform/envs/*.tfvars`.
4. Never commit filled `.env*` files. Use password managers or secret stores (Vault, Azure Key Vault, AWS Secrets Manager) for anything beyond localhost.

## API Environment Variables
- **Network/URLs**: `APP_URL=http://localhost:5173`, `APP_HOST=0.0.0.0`, `APP_PORT=3000`, `WORKER_HEALTH_PORT=3001`.
- **Auth Secrets**: `JWT_SECRET=replace_me_with_secure_jwt_secret_value`, `REFRESH_TOKEN_SECRET=replace_me_with_secure_refresh_secret`, `ACCESS_TOKEN_TTL=900`, `REFRESH_TOKEN_TTL=2592000`.
- **Database/Redis**: `DATABASE_URL`, `TEST_DATABASE_URL`, `PROD_DATABASE_URL` (see above), `REDIS_URL`.
- **Other**: `ENCRYPTION_KEY=cmVwbGFjZV9tZV93aXRoXzMyX2J5dGVfYmFzZTY0`, `SUPPORT_EMAIL=support@example.com`, `BILLING_WEBHOOK_SECRET=local-secret`, `PAYMENT_PROVIDER_MODE=mock` (switch to `sandbox` for the bundled sandbox or `real_provider` when pointing at a real gateway), `PAYMENT_PROVIDER_SANDBOX_BASE_URL=http://127.0.0.1:4015`, `PAYMENT_PROVIDER_SANDBOX_API_KEY=sandbox-api-key`, `PAYMENT_PROVIDER_BASE_URL`/`PAYMENT_PROVIDER_API_KEY` (required when `PAYMENT_PROVIDER_MODE=real_provider`), `PAYMENT_PROVIDER_TIMEOUT_MS=5000`, `PAYMENT_PROVIDER_SANDBOX_OUTCOME=completed|pending|failed` to drive the sandbox server’s initial response, `PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS` (defaults to 3000ms) controls how long pending sandbox payments wait before the webhook fires, and `PAYMENT_PROVIDER_WEBHOOK_SECRET=sandbox-webhook-secret` secures `/v1/portal/pos/payments/:paymentId/status`. Payment status queue tuning: `PAYMENT_STATUS_QUEUE_NAME` (default `payment-status`), `PAYMENT_STATUS_MAX_ATTEMPTS` (default 5), `PAYMENT_STATUS_BACKOFF_MS` (default 3000).
- **Sandbox server overrides** (if you need to customize the standalone gateway): `PAYMENT_SANDBOX_PORT` (default `4015`), `PAYMENT_SANDBOX_HOST` (`127.0.0.1`), `PAYMENT_SANDBOX_WEBHOOK_BASE_URL` (defaults to `http://localhost:3000/v1/portal`), `PAYMENT_SANDBOX_RECEIPT_BASE_URL`, and `PAYMENT_PROVIDER_SANDBOX_PENDING_FINAL_STATUS` (controls whether pending settlements complete or fail).

> These values are currently local-development defaults. Rotate and store them securely (e.g., in Vault/Secret Manager) before deploying to shared environments.

### Portal Workspace Variables
- `PORTAL_API_BASE_URL` / `NEXT_PUBLIC_PORTAL_API_BASE_URL`: overrides the default `http://localhost:3000` origin the customer portal uses for `/v1/portal/**` calls (set `.env.local` to `PORTAL_API_BASE_URL=http://localhost:3000` for the dev stack).
- `PORTAL_LOG_FALLBACKS`: set to `true` only when you want the portal to log fallback-to-sample-data warnings during development. Leave unset/false to avoid noisy “invalid source map” warnings emitted by Turbopack.
- `PORTAL_ACCESS_TOKEN` / `NEXT_PUBLIC_PORTAL_ACCESS_TOKEN`: optional bearer override (useful for automation or scripted smoke tests when you do not want to hit `/login`).
- When unset (or when an API call fails), the portal falls back to the deterministic sample-data kit so developers can continue iterating locally/staging.
- `PLAYWRIGHT_PORTAL_API_HOST` / `PLAYWRIGHT_PORTAL_API_PORT` (defaults `127.0.0.1:3999`) control the standalone mock API server defined in `tests/e2e/portal/mock-api-server.ts` (launched by `tests/e2e/portal/run-portal-with-mock.ts` for Playwright). It responds to `/v1/portal/**` requests with the deterministic sample dataset so SSR + browser fetches succeed even when the real API is offline.
- `PLAYWRIGHT_PORTAL_API_MODE`: set to `mock` (default) to boot the deterministic mock server for Playwright runs, or `live` to skip it and rely on the URLs/tokens you provide (e.g., pointing the portal at `http://localhost:3000` with a real login flow).
## Building & Publishing Service Images

1. Install Google Cloud CLI and authenticate:
   ```powershell
   gcloud auth login
   gcloud config set project rms-nova
   gcloud auth configure-docker
   ```
2. Build the API and worker images from the repo root:
   ```powershell
   docker build -t gcr.io/rms-nova/nova-rms-api:staging -f services/api/Dockerfile .
   docker build -t gcr.io/rms-nova/nova-rms-worker:staging -f services/worker/Dockerfile .
   # Repeat with :production tags when ready
   ```
3. Push the images:
   ```powershell
   docker push gcr.io/rms-nova/nova-rms-api:staging
   docker push gcr.io/rms-nova/nova-rms-worker:staging
   docker push gcr.io/rms-nova/nova-rms-api:production
   docker push gcr.io/rms-nova/nova-rms-worker:production
   ```
   Skip the production pushes until the rollout resumes and a managed cluster is ready.
4. For local Minikube testing (using the bundled kubeconfig), load the freshly built tags so Terraform/Helm can reuse them without pulling from the registry:
   ```powershell
   "C:\Program Files\Kubernetes\Minikube\minikube.exe" image load gcr.io/rms-nova/nova-rms-api:staging
   "C:\Program Files\Kubernetes\Minikube\minikube.exe" image load gcr.io/rms-nova/nova-rms-worker:staging
   ```
5. Update `infra/helm/nova-stack/values-staging.yaml` / `values-production.yaml` to reference the new images, restore real environment vars, then run:
   ```powershell
   cd infra/terraform
   terraform apply -var-file=envs/staging.tfvars
   terraform apply -var-file=envs/production.tfvars
   ```
   Only run the production apply when the production rollout restarts and a managed cluster is available.
### Published Image Tags
- `gcr.io/rms-nova/nova-rms-api:staging` ï¿½ digest `sha256:70ddba5d917cf52a5856455e204fe5fcb3eeb2f787e85f47bf8e52c207ba0dd8`
- `gcr.io/rms-nova/nova-rms-worker:staging` ï¿½ digest `sha256:41b3f986dd2be64f11d9aa2ae6c808eaa8d6853a297bafa49de74ee71e37ab19`

_(Push production tags after building the production images.)_
- `gcr.io/rms-nova/nova-rms-api:production` ï¿½ digest `sha256:036ff1e21fab25a207cc23ac22ca79f4a74706bd8b9f0f62d3315da60d91d0f2`
- `gcr.io/rms-nova/nova-rms-worker:production` ï¿½ digest `sha256:557d34f0774e64b155e5c7493b03a9edc590121d1bba41b92be984a2ce24ca41`
### Cluster Datastores
- `infra/k8s/staging-datastores.yaml` deploys Postgres 16 (user `rms_app`, password `Owner@123`) and Redis 7 (no auth) for the Minikube staging environment. Production manifests remain in `infra/k8s/production-*.yaml` for future use once a managed cluster exists.
- Services are named `postgres` and `redis`, matching the connection strings in the staging/production secrets.

## Sample Data Kit
- After migrations + tenant onboarding, seed baseline menu/inventory/POS data via:
  ```powershell
  pnpm seed:sample-data -- --tenant-alias demo-coffee
  ```
- The script (`scripts/seed-sample-data.ts`) reads `DATABASE_URL`, writes deterministic records inside a transaction, and supports `--dry-run`, `--tenant-id`, `--location-id`, and `--user-id` overrides. Details live in `docs/SAMPLE_DATA.md`. Use it whenever you need realistic data for demos, QA, or test fixtures.

### API-driven Tenant Bootstrap
- Run `pnpm tsx scripts/generate-superadmin-token.ts > superadmin-token.latest` to mint an 8-hour superadmin token signed with your current `JWT_SECRET`, then export it in your terminal (`$env:SUPERADMIN_TOKEN = Get-Content superadmin-token.latest`).
- Run `pnpm seed:tenant -- --business-name "Demo Coffee" --owner-email demo@example.com --owner-password "Owner@12345"` to register a tenant via `/v1/auth/register`, approve it through the superadmin API, and automatically invoke the sample-data seed.
- Required inputs: `SUPERADMIN_TOKEN` (bearer for the superadmin endpoints), `DATABASE_URL`, and either `API_URL` or `API_BASE_URL` if you are not targeting `http://localhost:3000` (set `API_URL` to the `/v1` URL, e.g., `http://localhost:3000/v1`, or let the script infer `/v1` when `API_BASE_URL` is a bare host).
- Use `--skip-sample-data` (or `SEED_SKIP_SAMPLE_DATA=true`) when you only want to drive registration + approval without touching the deterministic dataset.

### Integration Tests & Auto-Migrations
- `pnpm test:integration` now runs pending database migrations automatically before seeding tenants. The helper under `tests/helpers/ensure-migrations.ts` shares the same logic as `pnpm --filter @nova/api db:migrate`, so your `rms_test` database always matches the latest schema when integration tests spin up.
- Set `SKIP_AUTO_MIGRATE=true` if you need to opt out (for example, when pointing at a managed database that is already controlled elsewhere) and run the migration command manually.
- This automation only targets the configured test database; run the standard migration command for dev/staging/prod environments as part of your usual rollout flow.

### Payment Sandbox Server
- Run `pnpm dev:payments-sandbox` whenever `PAYMENT_PROVIDER_MODE=sandbox` so capture/refund calls leave the API over HTTP and settlement webhooks bounce back into `/v1/portal/pos/payments/:paymentId/status`. For `PAYMENT_PROVIDER_MODE=real_provider`, supply `PAYMENT_PROVIDER_BASE_URL`, `PAYMENT_PROVIDER_API_KEY`, and the webhook secret so the API targets your gateway instead of the sandbox.
- Configure the `.env` keys above before starting the sandbox script; portal/API instances talk to it via `PAYMENT_PROVIDER_SANDBOX_BASE_URL` and the script calls back using `PAYMENT_SANDBOX_WEBHOOK_BASE_URL`.
- Default port is `4015`; update `PAYMENT_SANDBOX_PORT` if that collides with another service.
