# Security Policy

## Supported Versions
Nova RMS is pre-release; report all issues against `main`. Security patches are backported once versioning begins (targeting semantic versioning post-M3).

## Reporting a Vulnerability
- Email security@navor.ms (placeholder) with detailed findings.
- Include reproduction steps, affected endpoints/modules, and impact assessment.
- Use our PGP key (available on keybase.io/nova-rms) for sensitive disclosures.
- Expect initial response within 1 business day; SLA for critical fixes is 72 hours.

## Scope
- API endpoints under `/v1` (Identity, RBAC, Module Registry, Superadmin, Billing, Support, POS, Inventory).
- Frontend applications (`apps/portal`, `apps/superadmin`).
- Infrastructure as code under `infra/`.

## Exclusions
- Social engineering of staff.
- Physical attacks or denial-of-service testing without written approval.
- Third-party services not owned by Nova RMS.

## Coordinated Disclosure
We will:
1. Acknowledge the report.
2. Provide status updates until remediation.
3. Publish advisories with CVSS score and mitigation guidance.
4. Credit researchers unless anonymity requested.

## Development Guardrails
- Enforce MFA for all administrative accounts.
- Store secrets in vault (AWS Secrets Manager / Azure Key Vault).
- Rotate JWT and encryption keys every 180 days (documented in ops runbook).
- Run dependency scans weekly (Dependabot + Snyk).

Thank you for helping keep Nova RMS secure.
