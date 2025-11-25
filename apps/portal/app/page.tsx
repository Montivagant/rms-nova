import { Card, Button } from "@nova/design-system";
import { MetricCard } from "@components/MetricCard";
import { getDashboardData, getPortalContext, getLocationSummaries } from "@lib/data-sources";
import { portalNavLinks } from "@lib/navigation";
import { isModuleEnabled } from "@lib/module-guards";
import Link from "next/link";

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const [snapshot, context, locations] = await Promise.all([
    getDashboardData(),
    getPortalContext(),
    getLocationSummaries()
  ]);
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedModule = resolvedSearchParams.module;
  const moduleNotice =
    requestedModule && !isModuleEnabled(context, requestedModule)
      ? (() => {
          const label =
            portalNavLinks.find((link) => link.moduleId === requestedModule)?.label ?? requestedModule;
          return (
            <div className="portal-alert portal-alert--info">
              <strong>{label}</strong> is currently disabled for this tenant.
            </div>
          );
        })()
      : null;

  return (
    <div className="portal-page">
      {moduleNotice}
      <section className="portal-grid portal-grid--metrics">
        {snapshot.metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      {locations.length > 0 ? (
        <Card title="Location overview">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <p className="text-muted" style={{ margin: 0 }}>
              Track menu overrides and inventory items per location to prep for the upcoming multi-location workflow.
            </p>
            <Button asChild size="sm" variant="ghost">
              <Link href="/locations">View locations</Link>
            </Button>
          </div>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Inventory Items</th>
                <th>Menu Overrides</th>
              </tr>
            </thead>
            <tbody>
              {locations.slice(0, 3).map((location) => (
                <tr key={location.id}>
                  <td>
                    <strong>{location.name}</strong>
                    <div className="text-muted">
                      {location.isPrimary ? "Primary" : location.managed ? "Managed location" : "System data"}
                    </div>
                  </td>
                  <td>{location.totalInventoryItems}</td>
                  <td>{location.totalMenuItems}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <section className="portal-grid portal-grid--split">
        <Card title="Top Menu Items">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Sold</th>
                <th>Gross</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.topMenuItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="text-muted">{item.category}</div>
                  </td>
                  <td>{item.soldToday}</td>
                  <td>{item.grossToday}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Inventory Alerts">
          <ul className="list-reset">
            {snapshot.inventoryAlerts.map((item) => (
              <li key={item.id} className="inventory-alert__item">
                <span>{item.name}</span>
                <span>
                  {item.onHand} / {item.parLevel} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card title="Recent Tickets">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.recentTickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>
                  <strong>{ticket.id}</strong>
                  <div className="text-muted">
                    {ticket.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                  </div>
                </td>
                <td>{ticket.channel}</td>
                <td>
                  <span className={`badge ${ticket.status === "Paid" ? "badge--success" : "badge--warning"}`}>
                    {ticket.status}
                  </span>
                </td>
                <td>{ticket.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
