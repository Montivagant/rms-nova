import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Card } from "@nova/design-system";
import {
  getInventoryCounts,
  getInventoryCountDetail,
  getInventoryData,
  getLocationSummaries,
  getPortalContext
} from "@lib/data-sources";
import { ensureModuleEnabled } from "@lib/module-guards";
import { hasPermission } from "@lib/capabilities";
import { addInventoryAttachmentAction, reconcileInventoryAction } from "../actions";
import { EvidencePanel } from "./EvidencePanel";

const formatDate = (value: string | null) => {
  if (!value) return "Pending";
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default async function InventoryReconcilePage() {
  const context = await getPortalContext();
  ensureModuleEnabled(context, "inventory");
  if (!hasPermission(context, ["inventory.counts.create"])) {
    redirect("/inventory");
  }

  const [inventoryItems, locations, recentCounts] = await Promise.all([
    getInventoryData(),
    getLocationSummaries(),
    getInventoryCounts(5)
  ]);
  const initialAttachmentDetail =
    recentCounts.length > 0 ? await getInventoryCountDetail(recentCounts[0].id) : null;

  const manageableIds = new Set(
    context.locationAccess.isScoped
      ? context.locationAccess.manageableLocationIds
      : locations.map((location) => location.id)
  );

  const selectableLocations = locations.filter((location) => {
    if (location.isPrimary) return true;
    if (!context.locationAccess.isScoped) return true;
    return manageableIds.has(location.id);
  });
  const initialAttachmentSessionId = initialAttachmentDetail?.session.id;
  const initialAttachments = initialAttachmentDetail?.attachments ?? [];

  const defaultLocationId =
    selectableLocations[0]?.id ?? locations[0]?.id ?? context.tenant.id;
  const defaultSessionName = `Cycle count ${new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit"
  })}`;

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Inventory reconciliation</h2>
          <p className="text-muted">
            Capture a physical count, sync stock levels, and log the adjustments automatically.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/inventory">Back to inventory</Link>
        </Button>
      </div>

      <Card title="Record counted quantities">
        {!selectableLocations.length ? (
          <p className="text-muted" style={{ margin: 0 }}>
            You need manage access to at least one location before running a count. Ask a superadmin
            to grant `inventory.locations.manage_assignments` access for the desired location.
          </p>
        ) : inventoryItems.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>
            Seed inventory items before reconciling. Use the quick adjustment form on the inventory
            page once items exist.
          </p>
        ) : (
          <form action={reconcileInventoryAction} className="inventory-reconcile-form">
            <label>
              Session name
              <input
                type="text"
                name="countName"
                defaultValue={defaultSessionName}
                required
                maxLength={120}
              />
            </label>

            <label>
              Location
              <select name="locationId" defaultValue={defaultLocationId} required>
                {selectableLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ overflowX: "auto" }}>
              <table className="portal-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Item</th>
                    <th>Unit</th>
                    <th>On hand</th>
                    <th>Counted quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.unit}</td>
                      <td>{item.onHand}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          name={`count__${item.id}`}
                          defaultValue={item.onHand}
                          min={0}
                          required
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button type="submit" disabled={inventoryItems.length === 0}>
              Save and reconcile
            </Button>
          </form>
        )}
      </Card>

      <Card title="Recent sessions">
        {recentCounts.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>
            No reconciliation history yet. Run your first count to populate this timeline.
          </p>
        ) : (
          <table className="portal-table">
            <thead>
              <tr>
                <th>Name</th>
              <th>Status</th>
              <th>Location</th>
              <th>Items counted</th>
              <th>Variance</th>
              <th>Updated</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {recentCounts.map((count) => (
              <tr key={count.id}>
                  <td>{count.name}</td>
                  <td>
                    <span className={`badge badge--${count.status === "completed" ? "success" : "warning"}`}>
                      {count.status}
                    </span>
                  </td>
                  <td>{count.locationName}</td>
                  <td>{count.totalItems}</td>
                  <td>{count.totalVariance}</td>
                  <td>{formatDate(count.updatedAt)}</td>
                  <td>
                    <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                      {count.attachmentsCount === 0
                        ? "No attachments"
                        : `${count.attachmentsCount} file${count.attachmentsCount === 1 ? "" : "s"}`}
                    </div>
                    <a
                      href={`/v1/portal/inventory/counts/${count.id}/export`}
                      className="text-link"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Download CSV
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Evidence attachments">
        <p className="text-muted" style={{ marginTop: 0 }}>
          View the files linked to recent sessions and jump to the exact evidence bundle your ops
          reviews need. Attachments are stored as signed/external URLs, so upload files to your storage
          provider first, then link them here.
        </p>
        <EvidencePanel
          sessions={recentCounts}
          initialSessionId={initialAttachmentSessionId}
          initialAttachments={initialAttachments}
        />
      </Card>

      <Card title="Add attachment">
        {recentCounts.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>
            Record a reconciliation session before attaching supporting files.
          </p>
        ) : (
          <form action={addInventoryAttachmentAction} className="inventory-attachment-form">
            <label>
              Session
              <select name="countId" defaultValue={recentCounts[0]?.id}>
                {recentCounts.map((count) => (
                  <option key={count.id} value={count.id}>
                    {count.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description
              <input
                type="text"
                name="label"
                placeholder="Shelf photos, signed sheet, etc."
                maxLength={120}
              />
            </label>
            <label>
              File URL
              <input
                type="url"
                name="url"
                placeholder="https://files.example.com/signed-url"
                required
                maxLength={2048}
              />
            </label>
            <Button type="submit">Attach evidence</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
