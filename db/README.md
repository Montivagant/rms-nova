# PostgreSQL Setup + Orientation

Nova ships with a vanilla Postgres 16 schema, but there are a lot of tables. This guide covers both the “how do I run it?” basics and the “what lives where?” references that make the schema feel less mysterious.

---

## 1. Provision Postgres

Pick the path that matches your workstation or environment:

| Environment | Commands |
| --- | --- |
| **Windows** | `psql --version`<br>`Get-Service *postgres*` (start the service if it is stopped). |
| **macOS (Homebrew)** | `psql --version`<br>`brew services start postgresql@16` |
| **Linux (Debian/Ubuntu)** | `psql --version`<br>`sudo systemctl status postgresql` |
| **Docker** | `docker run -d --name nova-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -v nova-pgdata:/var/lib/postgresql/data postgres:16` |

If you inherit an instance (staging/prod), confirm you have a superuser login before proceeding.

## 2. Create Roles and Databases

1. Connect as `postgres`: `psql -U postgres -h localhost`
2. Create the app role/database trio:

```sql
CREATE ROLE rms_app WITH LOGIN PASSWORD 'rms_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE rms_app SET client_encoding TO 'UTF8';
ALTER ROLE rms_app SET timezone TO 'UTC';

CREATE DATABASE rms_dev OWNER rms_app;
CREATE DATABASE rms_test OWNER rms_app;
CREATE DATABASE rms_prod OWNER rms_app;
```

Update `.env`:

```
DATABASE_URL=postgres://rms_app:<password>@localhost:5432/rms_dev
TEST_DATABASE_URL=postgres://rms_app:<password>@localhost:5432/rms_test
```

(Never commit secrets—copy `.env.example` instead.)

## 3. Run and Inspect Migrations

Migrations live in `db/migrations/{version}_{slug}.sql`. Apply them via:

```
pnpm --filter @nova/api db:migrate
```

Need a quick status? Use the new helper:

```
pnpm --filter @nova/api db:status
```

This prints every migration with an `applied`/`pending` flag so you know whether your database matches the repo.

Rollbacks (`pnpm --filter @nova/api db:rollback`) are for local experiments only. Shared environments should always “fix forward”.

## 4. Understand the Schema

- Read [`docs/DB_SCHEMA.md`](../docs/DB_SCHEMA.md) for a domain-by-domain explanation plus a Mermaid ER diagram (source lives in `db/schema.er.mmd`).
- The mega migration `001_initial.up.sql` is organized with section headers (Identity, Billing, Menu, POS, etc.)—use those comments as waypoints.
- Plan/entitlement seed data resides in `004_seed_plans_and_entitlements.up.sql`, so the DB already knows which modules/feature flags belong to each plan tier.

## 5. Health + Backups Checklist

- Smoke-test the API after migrations: `pnpm --filter @nova/api dev` then `curl http://localhost:3000/v1/health`.
- Capture dumps before major schema changes: `pg_dump -U rms_app -d rms_dev -Fc -f backups/rms_dev_$(date +%Y%m%d).dump`
- Production/staging should enable WAL/PITR before go-live (tracked in ops runbook).

### Acceptance (new environment)

- [ ] `psql --version` reports ≥ 16
- [ ] `rms_app` role + `rms_dev` database exist
- [ ] `pnpm --filter @nova/api db:migrate` completes cleanly
- [ ] `pnpm --filter @nova/api db:status` shows no pending migrations
- [ ] API `/v1/health` returns `status: ok`
- [ ] Initial dump stored safely

Keep this file and `docs/DB_SCHEMA.md` side-by-side when making schema changes so the SQL, documentation, and tooling stay aligned.
