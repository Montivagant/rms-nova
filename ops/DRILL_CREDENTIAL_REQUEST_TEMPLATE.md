# Billing Drill Credential Checklist (Self-Serve)

Use this checklist when you need staging (or future production) values for `tests/drills/<env>.drill.env`. Everything below is self-serve, so you can run it locally without waiting on anyone else. While production infrastructure is deferred, focus on the staging steps and keep the production placeholders handy.

## 1. Prepare the database target
1. Ensure Postgres is running (Docker Compose or managed instance).
2. Create the environment database:
   ```sql
   CREATE DATABASE rms_staging OWNER rms_app;
   CREATE DATABASE rms_prod OWNER rms_app;
   ```
   Adjust names or credentials if your instance already uses a different role.
3. Run migrations for the chosen environment:
   ```bash
   DATABASE_URL=postgres://rms_app:Owner%40123@localhost:5432/rms_staging pnpm --filter @nova/api db:migrate
   ```
   Repeat for `rms_prod` as needed.
   > Tip: if your local CLI cannot reach the containerised Postgres instance, pipe the SQL directly through Docker, e.g. `type db/migrations/001_initial.up.sql | docker exec -i -e PGPASSWORD=root nova-postgres psql -U root -d rms_staging`.

## 2. Generate webhook secret
```bash
openssl rand -hex 16
```
Copy the output into the `BILLING_WEBHOOK_SECRET` field for each environment and the corresponding API `.env`.

## 3. Seed the drill tenant + subscription
Replace UUIDs with fresh ones (`uuidgen`), then run against the target database:
```sql
INSERT INTO tenants (id, name, alias, status, plan_id)
VALUES (
  '00000000-0000-0000-0000-00000000abcd',
  'Drill Tenant',
  'drill-staging',
  'active',
  '7f4c6d3f-7de2-4ba1-92a7-9baf0e3a8ed1' -- Core plan
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (id, tenant_id, plan_id, status, billing_cycle)
VALUES (
  '00000000-0000-0000-0000-00000000c0de',
  '00000000-0000-0000-0000-00000000abcd',
  '7f4c6d3f-7de2-4ba1-92a7-9baf0e3a8ed1',
  'active',
  'monthly'
)
ON CONFLICT (id) DO NOTHING;
```
Adjust aliases and IDs per environment if you prefer distinct tenants.
> Running inside Docker? Execute with `docker exec -e PGPASSWORD=root nova-postgres psql -U root -d rms_staging -c "<SQL>"`.

## 4. Populate the drill env file
Update `tests/drills/staging.drill.env` (and the production placeholder file when ready) with:
```
DATABASE_URL=postgres://rms_app:Owner%40123@localhost:5432/rms_staging
API_URL=http://localhost:3000/v1
BILLING_WEBHOOK_SECRET=<generated-secret>
DRILL_TENANT_ID=00000000-0000-0000-0000-00000000abcd
DRILL_SUBSCRIPTION_ID=00000000-0000-0000-0000-00000000c0de
DRILL_PLAN_ID_TARGET=1ef168c5-66e9-4d11-8f51-32301dbce0d4
DRILL_PLAN_ID_SOURCE=7f4c6d3f-7de2-4ba1-92a7-9baf0e3a8ed1
DRILL_BILLING_CYCLE=monthly
```
Point `API_URL` at the deployed superadmin API when running against real infrastructure.

## 5. Run the drill
```bash
pnpm drill:billing --env-file tests/drills/staging.drill.env
```
Review console output plus `tests/drills/logs/<env>/` for captured evidence.

Document any deviations or additional guardrails in this file so future runs stay self-contained.
