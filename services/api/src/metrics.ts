import client from "prom-client";

const register = new client.Registry();

client.collectDefaultMetrics({ register, prefix: "nova_api_" });

export const httpRequestHistogram = new client.Histogram({
  name: "nova_api_http_request_duration_seconds",
  help: "Request duration histogram",
  registers: [register],
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

export const metricsRegistry = register;

export const moduleToggleCounter = new client.Counter({
  name: "nova_api_superadmin_module_toggle_total",
  help: "Count of superadmin module toggle updates",
  registers: [register],
  labelNames: ["module", "enabled"]
});

export const billingSummaryGauges = {
  activeTenants: new client.Gauge({
    name: "nova_api_billing_active_tenants",
    help: "Number of tenants with active or trialing subscriptions",
    registers: [register]
  }),
  monthlyRecurringRevenueCents: new client.Gauge({
    name: "nova_api_billing_mrr_cents",
    help: "Total monthly recurring revenue in cents across active subscriptions",
    registers: [register]
  }),
  pastDueTenants: new client.Gauge({
    name: "nova_api_billing_past_due_tenants",
    help: "Number of tenants with past-due subscription status",
    registers: [register]
  }),
  upcomingRenewals: new client.Gauge({
    name: "nova_api_billing_upcoming_renewals",
    help: "Number of subscriptions renewing in the next 14 days",
    registers: [register]
  }),
  cancelAtPeriodEnd: new client.Gauge({
    name: "nova_api_billing_cancel_at_period_end",
    help: "Number of subscriptions set to cancel at the end of the current period",
    registers: [register]
  }),
  openInvoices: new client.Gauge({
    name: "nova_api_billing_open_invoices",
    help: "Number of invoices currently open",
    registers: [register]
  })
};

export const billingWebhookCounter = new client.Counter({
  name: "nova_api_billing_webhook_total",
  help: "Count of billing webhook lifecycle events by status",
  registers: [register],
  labelNames: ["status", "event_type"]
});

export const posPaymentCaptureCounter = new client.Counter({
  name: "nova_api_pos_payment_capture_total",
  help: "Count of POS payment capture attempts by provider/mode/status",
  registers: [register],
  labelNames: ["provider", "mode", "status"]
});

export const posPaymentRefundCounter = new client.Counter({
  name: "nova_api_pos_payment_refund_total",
  help: "Count of POS refund attempts by provider/mode/status",
  registers: [register],
  labelNames: ["provider", "mode", "status"]
});
