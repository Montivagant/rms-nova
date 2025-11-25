# Kubernetes Manifests

This folder collects environment-specific Kubernetes manifests that sit alongside the Terraform + Helm automation. Use them for assets that Helm/ Terraform do not manage directly (e.g., secrets, configmaps populated from secure stores).

- `secrets/staging-secrets.example.yaml` - template for staging API/worker secrets (database URL, Redis URL, JWT secret, refresh token secret).
- `secrets/production-secrets.example.yaml` - template for production API/worker secrets (database URL, Redis URL, JWT secret, refresh token secret).

> Apply the manifests via `kubectl apply -f ...` before running the Terraform release for the corresponding environment.
