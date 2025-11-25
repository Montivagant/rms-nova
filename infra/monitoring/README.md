# Monitoring Artifacts

This directory captures dashboard and alert definitions used to operate Nova RMS.

- `grafana/` contains dashboard JSON definitions that can be imported into Grafana.
- `alerts/` contains PrometheusRule manifests for alertmanager routing.

## Deploying

1. Import dashboards via Grafana UI or provision them through your preferred infrastructure workflow (e.g., Terraform, Helm dashboards config map).
2. Apply PrometheusRule manifests to the monitoring namespace:\
   `kubectl apply -f infra/monitoring/alerts/billing-webhook-alerts.yaml -n monitoring`
3. Confirm alerts are active with `kubectl get prometheusrules -n monitoring` and verify Grafana panels render data.
