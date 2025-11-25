import { Card, Button } from "@nova/design-system";
import { MetricCard } from "@components/MetricCard";
import { FilterPanel } from "@components/FilterPanel";
import { getReportingData, getPortalContext, getLocationSummaries } from "@lib/data-sources";
import { ensureModuleEnabled } from "@lib/module-guards";
import { hasPermission, formatPermissionRequirement } from "@lib/capabilities";
import { hasFeatureFlag } from "@lib/feature-flags";

const WINDOW_OPTIONS = [7, 30, 60, 90];
const clampWindow = (value: number) => Math.min(Math.max(value, 7), 90);
const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});
const formatCurrency = (value: number) => USD_FORMATTER.format(Number.isFinite(value) ? value : 0);
const parseCurrency = (value: string) => {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};
const formatPercent = (value: number) => {
  if (!Number.isFinite(value) || value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
};

export default async function ReportingPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const [context, locationSummaries] = await Promise.all([
    getPortalContext(),
    getLocationSummaries()
  ]);
  ensureModuleEnabled(context, "reports");
  const canExport = hasPermission(context, ["reporting.exports.request", "reporting.exports.download"]);
  const exportRequirement = formatPermissionRequirement("reporting.exports.request");
  const allowAdvancedReporting = hasFeatureFlag(context, "reporting", "advanced_reporting");
  const managedLocations = locationSummaries.filter((location) => location.managed);
  const locationAccess = context.locationAccess;
  const accessibleLocations = locationAccess.isScoped
    ? managedLocations.filter((location) => locationAccess.allowedLocationIds.includes(location.id))
    : managedLocations;
  const requestedLocationId = params?.locationId;
  const locationFilterEnabled = allowAdvancedReporting && accessibleLocations.length > 0;
  const effectiveLocationId =
    locationFilterEnabled &&
    requestedLocationId &&
    accessibleLocations.some((location) => location.id === requestedLocationId)
      ? requestedLocationId
      : "";
  const activeLocation =
    locationFilterEnabled && effectiveLocationId
      ? accessibleLocations.find((location) => location.id === effectiveLocationId) ?? null
      : null;
  const allowedWindows = allowAdvancedReporting ? WINDOW_OPTIONS : WINDOW_OPTIONS.filter((days) => days <= 30);
  const requestedWindow =
    clampWindow(Number(params?.windowDays ?? allowedWindows[0]) || allowedWindows[0]);
  const windowDays = allowedWindows.includes(requestedWindow) ? requestedWindow : allowedWindows[0];
  const category = params?.category ?? "";
  const effectiveCategory = allowAdvancedReporting ? category : "";
  const snapshot = await getReportingData({
    windowDays,
    category: effectiveCategory || undefined,
    locationId: activeLocation?.id
  });
  const categoryOptions = snapshot.categoryOptions ?? snapshot.topCategories.map((item) => item.category);
  const exportParams = new URLSearchParams({
    windowDays: String(windowDays),
    export: "csv"
  });
  if (effectiveCategory) exportParams.set("category", effectiveCategory);
  if (activeLocation) exportParams.set("locationId", activeLocation.id);
  const revenueTotals = snapshot.revenueSeries.map((point) => parseCurrency(point.total));
  const trailingRevenue = revenueTotals.reduce((sum, value) => sum + value, 0);
  const latestRevenue = revenueTotals[revenueTotals.length - 1] ?? 0;
  const previousRevenue =
    revenueTotals.length > 1 ? revenueTotals[revenueTotals.length - 2] ?? 0 : latestRevenue;
  const revenueDeltaRatio =
    previousRevenue === 0 ? 0 : (latestRevenue - previousRevenue) / previousRevenue;
  const ticketsTotal = snapshot.ticketSeries.reduce((sum, point) => sum + (point.count ?? 0), 0);
  const averageTickets =
    snapshot.ticketSeries.length > 0 ? Math.round(ticketsTotal / snapshot.ticketSeries.length) : 0;
  const peakTickets = snapshot.ticketSeries.reduce(
    (max, point) => Math.max(max, point.count ?? 0),
    0
  );
  const topCategory = snapshot.topCategories[0] ?? null;

  const locationSuffix = activeLocation ? ` (${activeLocation.name})` : "";

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Reporting</h2>
          <p className="text-muted">Revenue and ticket trends pulled from live tenant data.</p>
          {activeLocation ? (
            <p className="text-muted" style={{ marginTop: "0.25rem" }}>
              Filtering insights for <strong>{activeLocation.name}</strong>.
            </p>
          ) : null}
        </div>
        {canExport ? (
          <Button asChild size="sm" variant="ghost" style={{ alignSelf: "flex-start" }}>
            <a
              href={`/v1/portal/reporting?${exportParams.toString()}`}
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

      {allowAdvancedReporting ? (
        <section style={{ marginBottom: "1.5rem" }}>
          <div className="portal-page__header" style={{ marginBottom: "0.75rem" }}>
            <div>
              <h3>Advanced reporting insights</h3>
              <p className="text-muted">
                Additional analytics unlocked via the advanced_reporting feature flag.
              </p>
            </div>
          </div>
          <div className="portal-grid portal-grid--metrics">
            <MetricCard
              label={`Trailing ${windowDays}-day revenue${locationSuffix}`}
              value={formatCurrency(trailingRevenue)}
              delta={
                previousRevenue === 0 ? "Baseline established" : `${formatPercent(revenueDeltaRatio)} vs previous day`
              }
              helper={`Latest day ${formatCurrency(latestRevenue)}`}
              trend={revenueDeltaRatio >= 0 ? "up" : "down"}
            />
            <MetricCard
              label={`Avg tickets per day${locationSuffix}`}
              value={averageTickets.toLocaleString("en-US")}
              delta={`Peak ${peakTickets.toLocaleString("en-US")} tickets`}
              helper={`Based on past ${snapshot.ticketSeries.length || windowDays} days`}
            />
            <MetricCard
              label={`Top category${locationSuffix}`}
              value={topCategory ? topCategory.category : "No category data"}
              delta={topCategory ? topCategory.revenue : undefined}
              helper={
                topCategory
                  ? `${topCategory.revenue} across the last ${Math.max(windowDays, 30)} days`
                  : "Add sales data to reveal category mix"
              }
            />
          </div>
        </section>
      ) : null}

      <FilterPanel
        title="Filters"
        description="Adjust the reporting window, category, and location scope. Hide this panel for distraction-free analysis."
      >
        <form className="portal-card__section portal-filter-form" method="get">
          <label>
            Window
            <select name="windowDays" defaultValue={windowDays}>
              {allowedWindows.map((days) => (
                <option key={days} value={days}>
                  Last {days} days
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              name="category"
              defaultValue={effectiveCategory}
              disabled={!allowAdvancedReporting}
            >
              <option value="">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {locationFilterEnabled ? (
            <label>
              Location
              <select name="locationId" defaultValue={effectiveLocationId}>
                <option value="">All locations</option>
                {accessibleLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="portal-filter-form__actions">
            <Button type="submit" size="sm">
              Update
            </Button>
          </div>
        </form>
      </FilterPanel>

      <section className="portal-grid portal-grid--split">
        <Card title={`Revenue (last ${windowDays} days)`}>
          <ul className="list-reset">
            {snapshot.revenueSeries.map((point) => (
              <li key={point.date} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{point.date}</span>
                <strong>{point.total}</strong>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Tickets (last ${windowDays} days)`}>
          <ul className="list-reset">
            {snapshot.ticketSeries.map((point) => (
              <li key={point.date} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{point.date}</span>
                <strong>{point.count}</strong>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card
        title={
          effectiveCategory
            ? `Top Categories - filtered (${effectiveCategory})`
            : `Top Categories (last ${Math.max(windowDays, 30)} days${locationSuffix})`
        }
      >
        <table className="portal-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.topCategories.map((category) => (
              <tr key={category.category}>
                <td>{category.category}</td>
                <td>{category.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
