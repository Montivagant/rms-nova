import Link from "next/link";
import { Card, Button } from "@nova/design-system";
import { listOpenInvoices } from "@lib/billing";
import styles from "../lists.module.css";

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(amount);

export default async function BillingOpenInvoicesPage() {
  const { data } = await listOpenInvoices(50, 0);

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Open invoices</h1>
          <p className={styles.subtitle}>Invoices awaiting payment across all tenants.</p>
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
                <th>Amount due</th>
                <th>Due date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((invoice) => (
                  <tr key={invoice.invoiceId ?? invoice.id}>
                    <td>{invoice.tenantName}</td>
                    <td>{formatCurrency(invoice.totalDue)}</td>
                    <td>{formatDate(invoice.dueAt)}</td>
                    <td>{invoice.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={styles.emptyCell}>
                    No open invoices detected.
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
