import { Card, Button } from "@nova/design-system";
import { MetricCard } from "@components/MetricCard";
import { FilterPanel } from "@components/FilterPanel";
import { RefundPaymentForm } from "@components/RefundPaymentForm";
import { getPaymentsData, getPortalContext } from "@lib/data-sources";
import { ensureModuleEnabled } from "@lib/module-guards";
import { hasPermission, formatPermissionRequirement } from "@lib/capabilities";

const METHODS = ["Card", "Cash", "Online"];
const DAY_MS = 24 * 60 * 60 * 1000;

const clampLimit = (value: number) => Math.min(Math.max(value, 5), 50);

const toInputDate = (date: Date) => date.toISOString().slice(0, 10);

const normalizeRange = (startInput?: string, endInput?: string) => {
  const today = new Date();
  const end = endInput ? new Date(endInput) : today;
  let start = startInput ? new Date(startInput) : new Date(end.getTime() - 6 * DAY_MS);
  if (start > end) {
    const temp = new Date(start);
    start = end;
    end.setTime(temp.getTime());
  }
  const maxStart = new Date(end.getTime() - 89 * DAY_MS);
  if (start < maxStart) {
    start = maxStart;
  }
  return { start, end };
};

const formatProcessedAt = (value: { processedAt: string; processedAtIso?: string }) => {
  if (value.processedAtIso) {
    const date = new Date(value.processedAtIso);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  return value.processedAt;
};

const statusBadgeClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "completed") return "badge--success";
  if (normalized === "refunded") return "badge--info";
  if (normalized === "pending") return "badge--warning";
  return "badge--warning";
};

const parseCurrencyValue = (value?: string) => {
  if (!value) return 0;
  const normalized = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(normalized) ? normalized : 0;
};

const resolveCurrency = (paymentCurrency?: string, amount?: string) => {
  if (paymentCurrency) return paymentCurrency;
  if (amount?.trim().startsWith("€")) return "EUR";
  if (amount?.trim().startsWith("£")) return "GBP";
  return "USD";
};

const getRemainingValue = (payment: Awaited<ReturnType<typeof getPaymentsData>>["payments"][number]) => {
  if (typeof payment.remainingAmountValue === "number") return payment.remainingAmountValue;
  const total =
    typeof payment.totalAmountValue === "number"
      ? payment.totalAmountValue
      : parseCurrencyValue(payment.amount) + parseCurrencyValue(payment.tipAmount);
  const refunded =
    typeof payment.refundedAmountValue === "number"
      ? payment.refundedAmountValue
      : parseCurrencyValue(payment.refundedAmount);
  return Math.max(total - refunded, 0);
};

export default async function PaymentsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const context = await getPortalContext();
  ensureModuleEnabled(context, "pos");
  const canExport = hasPermission(context, ["reporting.exports.request", "reporting.exports.download"]);
  const canRefund = hasPermission(context, "pos.payments.refund");
  const exportRequirement = formatPermissionRequirement("reporting.exports.request");
  const method = params?.method ?? "";
  const limit = clampLimit(Number(params?.limit ?? 15) || 15);
  const { start, end } = normalizeRange(params?.startDate, params?.endDate);
  const startDate = toInputDate(start);
  const endDate = toInputDate(end);
  const snapshot = await getPaymentsData({
    method: method || undefined,
    limit,
    startDate,
    endDate
  });
  const exportParams = new URLSearchParams();
  exportParams.set("export", "csv");
  exportParams.set("limit", String(limit));
  if (method) exportParams.set("method", method);
  exportParams.set("startDate", startDate);
  exportParams.set("endDate", endDate);

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Payments</h2>
          <p className="text-muted">Live tender totals with automatic fallbacks when no activity exists yet.</p>
        </div>
        {canExport ? (
          <Button asChild size="sm" variant="ghost" style={{ alignSelf: "flex-start" }}>
            <a
              href={`/v1/portal/payments?${exportParams.toString()}`}
              rel="noreferrer noopener"
              target="_blank"
            >
              Export CSV
            </a>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            style={{ alignSelf: "flex-start" }}
            disabled
            title={`Requires ${exportRequirement}`}
          >
            Export CSV
          </Button>
        )}
      </div>

      <FilterPanel
        title="Filters"
        description="Adjust tender, rows, and date range. Focus mode hides this panel so tables get more room."
      >
        <form className="portal-card__section portal-filter-form" method="get">
          <label>
            Method
            <select name="method" defaultValue={method}>
              <option value="">All</option>
              {METHODS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rows
            <input type="number" name="limit" min={5} max={50} defaultValue={limit} />
          </label>
          <label>
            Start Date
            <input type="date" name="startDate" defaultValue={startDate} max={endDate} />
          </label>
          <label>
            End Date
            <input type="date" name="endDate" defaultValue={endDate} min={startDate} />
          </label>
          <div className="portal-filter-form__actions">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
          </div>
        </form>
      </FilterPanel>

      <section className="portal-grid portal-grid--metrics">
        <MetricCard label="Today" value={snapshot.summary.totalToday} helper="Gross incl. tips" />
        <MetricCard label="Last 7 Days" value={snapshot.summary.totalWeek} />
        <MetricCard
          label="Selected Range"
          value={snapshot.summary.rangeTotal}
          helper={`${startDate} -> ${endDate}`}
        />
        <Card>
          <strong>Tender Mix (7d)</strong>
          <ul className="list-reset" style={{ marginTop: "0.75rem" }}>
            {snapshot.summary.methods.map((method) => (
              <li key={method.method} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{method.method}</span>
                <span>{method.amount}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card title="Recent Payments">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Method</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Tip</th>
              <th>Processed</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.payments.map((payment) => {
              const remainingAmountValue = getRemainingValue(payment);
              const currency = resolveCurrency(payment.currency, payment.amount);
              return (
                <tr key={payment.id}>
                  <td>{payment.ticketId}</td>
                  <td>{payment.method}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <span className={`badge ${statusBadgeClass(payment.status)}`}>
                        {payment.status}
                      </span>
                      {payment.failureReason ? (
                        <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                          Reason: {payment.failureReason}
                        </span>
                      ) : null}
                      {payment.receiptUrl ? (
                        <a
                          href={payment.receiptUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-link"
                          style={{ fontSize: "0.85rem" }}
                        >
                          Receipt
                        </a>
                      ) : null}
                      {canRefund ? (
                        <RefundPaymentForm
                          paymentId={payment.id}
                          currency={currency}
                          remainingAmount={remainingAmountValue}
                          defaultAmount={remainingAmountValue}
                          disabled={payment.status !== "Completed" || remainingAmountValue <= 0}
                          disabledReason={
                            payment.status !== "Completed"
                              ? "Only completed payments can be refunded"
                              : remainingAmountValue <= 0
                                ? "Payment has already been fully refunded"
                                : undefined
                          }
                        />
                      ) : null}
                    </div>
                  </td>
                  <td>{payment.amount}</td>
                  <td>{payment.tipAmount}</td>
                  <td>{formatProcessedAt(payment)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
