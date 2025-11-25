import Link from "next/link";
import { Card, Button } from "@nova/design-system";
import { registrationModuleDefaults } from "@nova/module-registry/defaults";
import { getModuleToggleAnalytics } from "@lib/analytics";
import { getBillingSummary } from "@lib/billing";
import WindowPicker from "@components/WindowPicker";
import styles from "./page.module.css";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const formatCurrency = (cents: number) => currencyFormatter.format(cents / 100);
const preciseCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});
const formatAmount = (amount: number) => preciseCurrencyFormatter.format(amount);
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";

const ANALYTICS_WINDOWS = [7, 30, 60, 90] as const;
const DEFAULT_ANALYTICS_WINDOW = 30;

type BillingPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const resolveWindowParam = (raw: string | string[] | undefined) => {
  const normalized = Array.isArray(raw) ? raw[0] : raw;
  if (!normalized) return DEFAULT_ANALYTICS_WINDOW;
  const parsed = Number.parseInt(normalized, 10);
  return ANALYTICS_WINDOWS.includes(parsed as (typeof ANALYTICS_WINDOWS)[number])
    ? parsed
    : DEFAULT_ANALYTICS_WINDOW;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const windowDays = resolveWindowParam(searchParams?.window);
  const [summary, analytics] = await Promise.all([
    getBillingSummary(),
    getModuleToggleAnalytics(windowDays)
  ]);
  const activeWindow = analytics.windowDays ?? windowDays;

  const metrics = [
    {
      label: "Active tenants",
      value: summary.activeTenantCount.toLocaleString(),
      helper: "Subscriptions in trial or active state"
    },
    {
      label: "Monthly recurring revenue",
      value: formatCurrency(summary.monthlyRecurringRevenueCents),
      helper: "Sum of active plan pricing (USD)"
    },
    {
      label: "Past-due accounts",
      value: summary.pastDueTenantCount.toLocaleString(),
      helper: "Tenants with past-due billing status"
    }
  ];

  const queueItems = [
    {
      label: "Open invoices awaiting payment",
      value: summary.openInvoiceCount.toLocaleString()
    },
    {
      label: "Upcoming plan renewals (14d)",
      value: summary.upcomingRenewalCount.toLocaleString()
    },
    {
      label: "Cancel at period end",
      value: summary.cancelAtPeriodEndCount.toLocaleString()
    }
  ];

  const totalsByModule = new Map(analytics.totals.map((total) => [total.module, total]));
  const moduleAdoption = registrationModuleDefaults.map((module) => {
    const totals = totalsByModule.get(module.key);
    return {
      name: module.name,
      category: module.category ?? "Core",
      defaultState: module.enabled ? "enabled by default" : "optional by default",
      enabledCount: totals?.enabledCount ?? 0,
      disabledCount: totals?.disabledCount ?? 0
    };
  });

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Billing overview</h1>
          <p className={styles.subtitle}>
            Track plan performance, upcoming renewals, and module adoption before billing APIs go live.
          </p>
        </div>
      </header>

      <section aria-label="Billing metrics" className={styles.metricsGrid}>
        {metrics.map((metric) => (
          <Card key={metric.label} className={styles.metricCard} title={metric.label}>
            <div className={styles.metricValue}>{metric.value}</div>
            <p className={styles.metricHelper}>{metric.helper}</p>
          </Card>
        ))}
      </section>

      <section aria-label="Billing backlog" className={styles.backlogSection}>
        <Card title="Attention queue">
          <ul className={styles.list}>
            {queueItems.map((item) => (
              <li key={item.label}>
                <span className={styles.listValue}>{item.value}</span>
                <span className={styles.listLabel}>{item.label}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Module adoption presets">
          <div className={styles.sectionHeader}>
            <span>{`${activeWindow}-day window`}</span>
            <WindowPicker
              value={windowDays}
              defaultValue={DEFAULT_ANALYTICS_WINDOW}
              options={[...ANALYTICS_WINDOWS]}
              className={styles.windowPicker}
              label="Adjust window"
            />
          </div>
          <ul className={styles.list}>
            {moduleAdoption.map((module) => (
              <li key={module.name}>
                <div className={styles.listRow}>
                  <span className={styles.listLabel}>{module.name}</span>
                  <span className={styles.listMetric}>
                    {module.enabledCount} enable / {module.disabledCount} disable
                  </span>
                </div>
                <span className={styles.listHelper}>
                  {module.category} • {module.defaultState}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Upcoming renewals">
          <div className={styles.sectionHeader}>
            <span>Next 14 days</span>
            <Button asChild variant="ghost" size="sm">
              <Link href="/billing/renewals">View all</Link>
            </Button>
          </div>
          {summary.upcomingRenewals.length > 0 ? (
            <ul className={styles.list}>
              {summary.upcomingRenewals.map((renewal) => (
                <li key={renewal.id}>
                  <div className={styles.listRow}>
                    <span className={styles.listLabel}>{renewal.tenantName}</span>
                    <span className={styles.listMetric}>{formatCurrency(renewal.priceCents)}</span>
                  </div>
                  <span className={styles.listMeta}>
                    Plan: {renewal.planName} • Renews {formatDate(renewal.currentPeriodEnd)} •{" "}
                    {renewal.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyMessage}>No renewals scheduled in the next 14 days.</p>
          )}
        </Card>

        <Card title="Open invoices">
          <div className={styles.sectionHeader}>
            <span>Awaiting payment</span>
            <Button asChild variant="ghost" size="sm">
              <Link href="/billing/open-invoices">View all</Link>
            </Button>
          </div>
          {summary.openInvoices.length > 0 ? (
            <ul className={styles.list}>
              {summary.openInvoices.map((invoice) => (
                <li key={invoice.id}>
                  <div className={styles.listRow}>
                    <span className={styles.listLabel}>{invoice.tenantName}</span>
                    <span className={styles.listMetric}>{formatAmount(invoice.totalDue)}</span>
                  </div>
                  <span className={styles.listMeta}>
                    Due {formatDate(invoice.dueAt)} • {invoice.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyMessage}>No open invoices on record.</p>
          )}
        </Card>
      </section>
    </main>
  );
}

