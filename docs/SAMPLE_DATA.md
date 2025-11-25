# Sample Data Kit

Use the sample-data seeding script when you need realistic menu, inventory, and POS records for demos, Playwright flows, or upcoming business-module work. The dataset is deterministic (ids derived from the tenant id), so rerunning the script updates the same rows instead of duplicating them.

## What gets seeded

- **Inventory**: four staple items (coffee beans, oat milk, farm eggs, avocados) with stock levels, cost data, and opening `inventory_movements` tagged as `opening_stock`.
- **Menu**: two categories (Coffee Bar, Kitchen Favorites) plus four menu items with prices, tax rates, and recipe JSON linking back to the seeded inventory items.
- **Sample sale**: one settled POS ticket with line items and a completed payment (including processor/tender metadata, receipt URL, and deterministic reference) so reporting dashboards, payments tables, and mock APIs have immediate data.
- **Loyalty**: a deterministic loyalty account (`avery@example.com`) with an initial earn transaction so the new `/v1/portal/loyalty/**` endpoints always return balances/transactions without extra setup.
- **Reusable dataset**: the same records are exported via the `@nova/sample-data` package so portals, tests, and mock APIs share a single deterministic source of truth.

All inserts happen inside a transaction. Use `--dry-run` when you only want to validate connectivity/schema without writing anything.

## Running the script

```bash
# Seed tenant by id
pnpm seed:sample-data -- --tenant-id 11111111-2222-3333-4444-555555555555

# Or look up the tenant by alias and override the default location id + user
pnpm seed:sample-data \
  --tenant-alias demo-coffee \
  --location-id 7f94c2e0-6d5a-4d64-9630-76c7f7126c32 \
  --user-id 3cde5a64-8bf8-4cb1-9047-07b4cf5f6d51
```

Flags and env vars:

| Flag / Env                         | Description |
|-----------------------------------|-------------|
| `--tenant-id` / `SEED_TENANT_ID`  | Target tenant UUID (preferred when known). |
| `--tenant-alias` / `SEED_TENANT_ALIAS` | Look up tenant by alias instead of id. |
| `--location-id` / `SEED_LOCATION_ID` | Location UUID for menu prices & stock levels (defaults to all-zero sentinel). |
| `--user-id` / `SEED_SAMPLE_USER_ID` | User performing ticket/payment actions (falls back to earliest tenant user). |
| `--database-url`                  | Overrides `DATABASE_URL` for ad-hoc targets. |
| `--dry-run`                       | Executes everything inside a transaction and rolls back at the end. |

Before running:
1. Apply the latest migrations (`pnpm db:migrate`).
2. Ensure the tenant exists (registration+approval flow or manual insert).
3. Confirm `.env` contains a valid `DATABASE_URL` or pass `--database-url` explicitly.

The script lives at `scripts/seed-sample-data.ts` and is wired to `pnpm seed:sample-data`. The reusable data helpers/types are also distributed via `packages/sample-data` (`@nova/sample-data`). Update this doc whenever the dataset changes so ops/dev teams know what the baseline records represent.
