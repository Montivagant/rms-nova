import Link from "next/link";
import { Card, Button } from "@nova/design-system";
import { listUpcomingRenewals } from "@lib/billing";
import styles from "../lists.module.css";

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);

export default async function BillingRenewalsPage() {
  const { data } = await listUpcomingRenewals(50, 0);

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Upcoming renewals</h1>
          <p className={styles.subtitle}>
            Subscriptions in trial or active status scheduled to renew in the near term.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/billing">Back to billing overview</Link>
        </Button>
      </header>

      <Card>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Price</th>
                <th>Renews</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((renewal) => (
                  <tr key={renewal.subscriptionId ?? renewal.id}>
                    <td>{renewal.tenantName}</td>
                    <td>{renewal.planName}</td>
                    <td>{formatCurrency(renewal.priceCents)}</td>
                    <td>{formatDate(renewal.currentPeriodEnd)}</td>
                    <td>{renewal.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    No renewals scheduled within the current window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
