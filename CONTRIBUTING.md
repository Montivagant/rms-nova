# Contributing Guide

## Getting Started
1. Fork or create a branch from `main`.
2. Install dependencies with `pnpm install`.
3. Copy `.env.example` to `.env` and configure credentials.
4. Ensure Postgres and Redis are running (local or Docker).

## Branch & Commit Standards
- Branch naming: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`.
- Commit messages: Conventional Commits (`feat: add tenant approval flow`).
- Reference TODO ID in commit body when applicable.

## Development Workflow
1. Run `pnpm lint && pnpm typecheck` before committing.
2. Unit tests: `pnpm test:unit`; integration: `pnpm test:integration`; E2E: `pnpm test:e2e` (requires services up).
3. Update documentation (architecture, runbook, test plan) when behavior changes.
4. Add or update TODO acceptance criteria if scope changes.

## Pull Request Checklist
- [ ] Tests added/updated and passing locally.
- [ ] No TODO without owner + acceptance criteria.
- [ ] Migrations reviewed and tested (`pnpm --filter services/api db:migrate` on fresh DB).
- [ ] OpenAPI schemas regenerated (`pnpm generate:openapi`).
- [ ] Storybook updated for UI changes.
- [ ] Linked issue/TODO referenced in description.

## Code Review Expectations
- Prioritize correctness, security, and performance.
- Call out missing tests or documentation.
- Approvals require CI green and reviewer sign-off; at least one senior approver for production code.

## Release Process
1. Ensure milestone DoD met (see `TODO.md`).
2. Merge PRs via squash, following Conventional Commit convention.
3. Tag release via `pnpm release` script; CI publishes artifacts and triggers deployment.
4. Update `PROGRESS.md` and incidentally the runbook if operational steps changed.

## Communication
- Daily stand-up async thread in #nova-dev.
- Incident updates in #nova-ops.
- Architecture decisions captured as ADRs under `docs/adr/` (TBD during M0).

Thanks for keeping Nova RMS reliable and easy to operate.
