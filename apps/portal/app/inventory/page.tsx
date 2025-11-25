import Link from "next/link";
import { Button, Card } from "@nova/design-system";
import { getInventoryData, getInventoryAuditLog, getPortalContext } from "@lib/data-sources";
import { ensureModuleEnabled } from "@lib/module-guards";
import { hasPermission, formatPermissionRequirement } from "@lib/capabilities";
import { adjustInventoryItemAction } from "./actions";

const formatAuditTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

export default async function InventoryPage() {
  const context = await getPortalContext();
  ensureModuleEnabled(context, "inventory");
  const [items, auditLog] = await Promise.all([
    getInventoryData(),
    getInventoryAuditLog({ limit: 12 })
  ]);
  const lowStock = items.filter((item) => item.onHand <= item.parLevel);
  const canReconcile = hasPermission(context, ["inventory.counts.create", "inventory.movements.create"]);
  const reconcileRequirement = formatPermissionRequirement("inventory.counts.create");
  const canAdjustInventory = hasPermission(context, ["inventory.movements.create"]);
  const adjustRequirement = formatPermissionRequirement("inventory.movements.create");

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Inventory</h2>
          <p className="text-muted">Live stock levels with automatic sample fallback for new tenants.</p>
        </div>
        <Button
          asChild
          disabled={!canReconcile}
          title={!canReconcile ? `Requires ${reconcileRequirement}` : undefined}
        >
          <Link href="/inventory/reconcile">Reconcile inventory</Link>
        </Button>
      </div>

      <Card title="Current stock">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th>On hand</th>
              <th>Par</th>
              <th>Cost / unit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const belowPar = item.onHand <= item.parLevel;
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.unit}</td>
                  <td>{item.onHand}</td>
                  <td>{item.parLevel}</td>
                  <td>{item.costPerUnit}</td>
                  <td>
                    <span className={`badge ${belowPar ? "badge--warning" : "badge--success"}`}>
                      {belowPar ? "Below par" : "Healthy"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Quick adjustment">
        <form action={adjustInventoryItemAction} className="inventory-adjust-form">
          <label>
            Item
            <select
              name="itemId"
              defaultValue={items[0]?.id}
              required
              disabled={!items.length || !canAdjustInventory}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity delta
            <input
              type="number"
              step="0.1"
              name="quantityDelta"
              required
              placeholder="+/-5"
              disabled={!canAdjustInventory}
            />
          </label>
          <label>
            Reason
            <input
              type="text"
              name="reason"
              required
              maxLength={120}
              placeholder="Cycle count adjustment"
              disabled={!canAdjustInventory}
            />
          </label>
          <label>
            Notes
            <input
              type="text"
              name="notes"
              maxLength={256}
              placeholder="Optional note"
              disabled={!canAdjustInventory}
            />
          </label>
          <Button
            type="submit"
            disabled={!canAdjustInventory || items.length === 0}
            title={!canAdjustInventory ? `Requires ${adjustRequirement}` : undefined}
          >
            Apply adjustment
          </Button>
        </form>
      </Card>

      <Card title="Low stock snapshot">
        <ul className="list-reset">
          {lowStock.map((item) => (
            <li key={item.id} className="inventory-alert__item">
              <span>{item.name}</span>
              <span>
                {item.onHand} / {item.parLevel} {item.unit}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Audit log">
        {auditLog.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>
            No adjustments recorded yet. Run a cycle count or quick adjustment to populate the log.
          </p>
        ) : (
          <table className="portal-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Item</th>
                <th>Delta</th>
                <th>Reason</th>
                <th>User</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatAuditTimestamp(entry.createdAtIso)}</td>
                  <td>{entry.itemName}</td>
                  <td>
                    <span className={`badge ${entry.delta >= 0 ? "badge--success" : "badge--warning"}`}>
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta} {entry.unit}
                    </span>
                    {entry.notes ? (
                      <span className="text-muted" style={{ display: "block" }}>
                        {entry.notes}
                      </span>
                    ) : null}
                  </td>
                  <td>{entry.reason}</td>
                  <td>{entry.user}</td>
                  <td>{entry.locationName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
