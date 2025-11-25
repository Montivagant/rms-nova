# Terraform Deployment Scaffold

This directory contains the baseline Terraform configuration used to deploy the Nova stack Helm chart.

## Layout

- `main.tf`, `variables.tf`, `outputs.tf` ? root configuration wiring providers and the `nova-stack` module.
- `modules/nova-stack` ? wraps the Helm release for the combined API + worker chart under `infra/helm/nova-stack`.

## Usage

```bash
cd infra/terraform
terraform init
terraform plan -var="release_name=nova" -var="namespace=nova"
terraform apply
```

Key variables:

- `kubeconfig_path` / `kubeconfig_context` ? select the target cluster/context.
- `image_registry` / `image_tag` ? override the base image coordinates emitted by CI.
- `extra_values` ? list of file paths whose YAML contents are merged into the Helm release (see `envs/` examples).

> Populate Kubernetes secrets (e.g., `nova-api-secrets`, `nova-worker-secrets`) before applying the release.

## Environment Examples

Sample variable files live under `envs/`:
- `envs/staging.tfvars` ? staging namespace, pulls in `values-staging.yaml` for Helm overrides.
- `envs/production.tfvars` ? production settings and overrides.

Apply them with:

```bash
terraform plan -var-file=envs/staging.tfvars
terraform apply -var-file=envs/production.tfvars  # run once production infrastructure exists
```

> Ensure the referenced Kubernetes secrets (`nova-api-secrets`, `nova-worker-secrets`) contain the required connection URIs before applying.
