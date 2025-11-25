# Superadmin Console Plan

## Goal
Implement the superadmin portal that surfaces tenant registrations, onboarding progress, and global controls aligned with the Nova RMS roadmap.

## Current Status
- Registrations inbox, decision modal, module toggle flows, billing dashboards, and analytics drill-downs are live and powered by `@nova/design-system` primitives.
- The console rewrites `/v1/**` to the Fastify API (`http://localhost:3000`) and gracefully falls back to zeroed metrics when the backend is offline.
- Outstanding scope covers support/backups tooling, richer billing drill telemetry, and expanded Playwright smoke coverage; track the full local/staging execution order via `docs/LOCAL_STAGING_COMPLETION_PLAN.md`.

## Minimum Viable Flow (M0 -> M1)
1. **Authentication Context**
   - Reuse API-issued JWT (superadmin role).
   - Store tokens in secure httpOnly cookies (placeholder until auth gateway is ready).
2. **Registrations Inbox**
   - Fetch from `/v1/superadmin/registrations?status=pending`.
   - Display summary (legalName, contactEmail, submitted, status).
   - Provide Approve/Reject actions invoking `/v1/superadmin/registrations/{id}/decision`.
3. **Decision Modal**
   - Require reason on reject (optional on approve).
   - Show validation errors returned by API.
4. **Onboarding Checklist (stub)**
   - Surface returned tenantId/owner user after approval (placeholder panel for future tasks).

## Technical Stack (proposal)
- **Framework**: Next.js 14 (app router) with TypeScript.
- **UI**: Nova design-system primitives (packages/design-system).
- **Data Layer**: React Query for caching server responses.
- **Auth**: API calls via fetch wrapper injecting bearer token (temporary until SSO/gateway).

## File Structure (planned)
```
apps/superadmin/
  README.md        # this plan
  next.config.mjs  # next config for portal
  app/
    layout.tsx     # shared layout
    registrations/
      page.tsx     # pending registrations inbox
    billing/
      page.tsx     # overview with live metrics
      renewals/
        page.tsx   # upcoming renewals drill-down
      open-invoices/
        page.tsx   # open invoices drill-down
  lib/
    auth.ts        # token helpers (stub)
    registrations.ts
    billing.ts     # billing summary/analytics helpers
  components/
    RegistrationList.tsx
    RegistrationDecisionModal.tsx
```

## Architecture & Data Flow
- Next.js App Router renders the console, imports `@nova/design-system` primitives, and rewrites every `/v1/**` request to the API running on `http://localhost:3000`.
- The API enforces RBAC/module-registry rules and emits billing/module-toggle telemetry; responses flow back to the portal via React Query helpers in `apps/superadmin/lib/*`.
- BullMQ worker processes billing webhooks and exposes the health server on `http://localhost:3001` (`/healthz`, `/readyz`) so operators can confirm queue readiness while working inside the console.
- Registrations inbox, module toggles, billing analytics, and drill dashboards rely on those two backend ports only; keep both running whenever you iterate locally.

## API Helpers (current shape)
```ts
// apps/superadmin/lib/registrations.ts
export async function listRegistrations(status: RegistrationStatus) {
  const response = await fetch(
    `${baseUrl}/v1/superadmin/registrations?status=${status}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "include",
      cache: "no-store"
    }
  );
  if (!response.ok) throw await response.json();
  return (await response.json()) as { data: Registration[] };
}
```

## Running Locally
1. Start the backend stack:
   - API: `pnpm --filter @nova/api dev` (listens on `http://localhost:3000`). Optional shortcut: `pnpm dev:backend` launches API + worker together.
   - Worker: `pnpm --filter @nova/worker dev` (BullMQ processor + health server on `http://localhost:3001`).
   - Ensure Postgres + Redis are running locally (see `db/README.md` or use the Docker compose helper).
2. In `apps/superadmin`, copy `.env.example` to `.env.local` if needed. Optional overrides:
   - `API_BASE_URL` (defaults to `http://localhost:3000` when the API runs on that port)
   - `NEXT_PUBLIC_SUPERADMIN_BEARER` for bypassing login during local testing
3. Launch the portal: `pnpm dev:superadmin -- -p 3000`
   - `next.config.mjs` rewrites `/v1/*` to `API_BASE_URL`, so browser fetches avoid CORS.
4. Execute the Playwright smoke test: `pnpm test:e2e -- --project=chromium`.
5. The billing/analytics helpers log a warning and return zeroed data if the API is unreachable; once the API returns 404/500, check the browser console for `[billing]` or `[analytics]` fallbacks.

## Next Steps
1. Expose billing drill telemetry + queue health directly inside the console so ops can verify sandbox webhooks without leaving the workspace.
2. Ship support/backups tooling (ticket triage, announcement broadcast, snapshot triggers) in the superadmin UI to unblock the remaining M2 acceptance criteria.
3. Grow Playwright coverage to include billing drill-down navigation, module toggle regressions, and support tooling workflows so CI mirrors the TESTPLAN expectations.

---
Last updated: 2025-11-08 by Codex



