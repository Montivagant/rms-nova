# Portal Playwright Placeholder Flow

Until we have a dedicated Playwright environment seeded with real API data, the customer portal tests run against the deterministic sample-data kit that already ships with the workspace. The launcher supports two modes via `PLAYWRIGHT_PORTAL_API_MODE`:

| Mode | Behavior |
| --- | --- |
| `mock` (default) | Spins up `tests/e2e/portal/mock-api-server.ts`, injects a canned bearer token, and keeps the tests completely backend-free. |
| `live` | Skips the mock server, expects a real API target via `PORTAL_API_BASE_URL` / `NEXT_PUBLIC_PORTAL_API_BASE_URL`, and leaves authentication entirely up to you. |

## Current approach (mock/sample fallback)

1. Start only the portal shell (no API required):
   ```bash
   pnpm --filter @nova/portal dev
   ```
2. Run the placeholder Playwright suite (already wired to the portal config):
   ```bash
   pnpm test:e2e:portal
   ```
   The config (`playwright.portal.config.ts`) keeps `PLAYWRIGHT_PORTAL_API_MODE=mock`, so the launcher starts the deterministic mock API on `127.0.0.1:3999` (override with `PLAYWRIGHT_PORTAL_API_HOST`/`PLAYWRIGHT_PORTAL_API_PORT`) and injects `playwright-portal-token` as both server- and client-side bearer values.
3. Because the portal dev server now talks to the mock endpoint, both SSR and browser fetches succeed, and writes respond immediately with mock acknowledgements. This keeps the UI + Playwright suite behaving as if the API were online while we wait for a permanent Playwright/staging target.

## Transition plan for real API data

When we have a stable Playwright API target (local stack, Minikube, or staging), flip the launcher to live mode so the tests exercise the real backend:

1. Start the API + worker (`pnpm dev:backend`) and seed real data (`pnpm seed:tenant` + `pnpm seed:sample-data`).
2. Export the environment knobs before running Playwright:
   ```powershell
   $env:PLAYWRIGHT_PORTAL_API_MODE = "live"
   $env:PORTAL_API_BASE_URL = "http://localhost:3000"
   $env:NEXT_PUBLIC_PORTAL_API_BASE_URL = "http://localhost:3000"
   # Optional – provide a bearer/token if you do not want the tests to log in:
   # $env:PORTAL_ACCESS_TOKEN = "<tenant-token>"
   # $env:NEXT_PUBLIC_PORTAL_ACCESS_TOKEN = "<tenant-token>"
   ```
3. Run `pnpm test:e2e:portal`. The launcher now skips the mock API, reuses the portal dev server pointed at the URLs you supplied, and respects whatever authentication context you provide (unset the token env vars to force a `/login` flow).

Documenting this placeholder ensures we can flip the switches quickly once production/staging data is available without rewriting the tests from scratch.
