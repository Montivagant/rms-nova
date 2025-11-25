import Link from "next/link";
import { Button, Card } from "@nova/design-system";
import {
  getPortalContext,
  getLocationSummaries,
  getLocationAssignmentSummary
} from "@lib/data-sources";
import { hasPermission, formatPermissionRequirement } from "@lib/capabilities";
import { hasFeatureFlag } from "@lib/feature-flags";
import { ensureModuleEnabled } from "@lib/module-guards";
import {
  createLocationAction,
  toggleLocationStatusAction,
  assignInventoryToLocationAction,
  removeInventoryFromLocationAction,
  assignMenuItemsToLocationAction,
  removeMenuItemsFromLocationAction
} from "./actions";

const multiSelectSize = (count: number) => Math.min(8, Math.max(count, 4));

export default async function LocationsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const [context, locations] = await Promise.all([getPortalContext(), getLocationSummaries()]);
  ensureModuleEnabled(context, "inventory");

  const multiLocationEnabled = hasFeatureFlag(context, "global", "multi_location");

  if (!multiLocationEnabled) {
    return (
      <div className="portal-page">
        <Card>
          <p className="text-muted">
            Multi-location support is not enabled for this tenant yet. Toggle the{" "}
            <code>multi_location</code> feature flag from the superadmin console to begin testing the
            workflow.
          </p>
          <Button asChild size="sm">
            <Link href="/">Return to dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const managedLocations = locations.filter((location) => location.managed);
  const locationAccess = context.locationAccess;
  const allowedLocationSet = locationAccess.isScoped
    ? new Set(locationAccess.allowedLocationIds)
    : new Set(managedLocations.map((location) => location.id));
  const accessibleLocations = managedLocations.filter((location) => allowedLocationSet.has(location.id));
  const manageableLocationSet = locationAccess.isScoped
    ? new Set(locationAccess.manageableLocationIds)
    : allowedLocationSet;

  const requestedLocationId = params?.locationId;
  const defaultLocationId = accessibleLocations[0]?.id ?? null;
  const selectedLocationId =
    requestedLocationId && accessibleLocations.some((location) => location.id === requestedLocationId)
      ? requestedLocationId
      : defaultLocationId;

  const canReadAssignments = hasPermission(context, "inventory.locations.read");
  const canManageAssignments = hasPermission(context, "inventory.locations.manage_assignments");
  const readPermissionLabel = formatPermissionRequirement("inventory.locations.read");
  const managePermissionLabel = formatPermissionRequirement("inventory.locations.manage_assignments");

  const shouldLoadAssignments = canReadAssignments && selectedLocationId != null;
  const assignmentSummary =
    shouldLoadAssignments && selectedLocationId
      ? await getLocationAssignmentSummary(selectedLocationId)
      : null;
  const selectedLocationManageable =
    selectedLocationId != null && manageableLocationSet.has(selectedLocationId);
  const canManageSelectedLocation = Boolean(assignmentSummary) && canManageAssignments && selectedLocationManageable;
  const manageRestrictionMessage = !canManageAssignments
    ? `Enable ${managePermissionLabel} to make changes.`
    : "Request assignment access for this location to make changes.";

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Locations</h2>
          <p className="text-muted">
            Manage the locations that power inventory levels, menu overrides, and upcoming tenant routing.
          </p>
        </div>
      </div>

      <Card title="Current locations">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Code</th>
              <th>Timezone</th>
              <th>Status</th>
              <th>Inventory Items</th>
              <th>Menu Overrides</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id}>
                <td>
                  {location.name}
                  {!location.managed ? (
                    <span className="text-muted" style={{ display: "block" }}>
                      Managed by system data
                    </span>
                  ) : null}
                </td>
                <td>{location.code}</td>
                <td>{location.timezone}</td>
                <td>
                  <span className={`badge ${location.status === "active" ? "badge--success" : "badge--warning"}`}>
                    {location.status}
                  </span>
                </td>
                <td>{location.totalInventoryItems}</td>
                <td>{location.totalMenuItems}</td>
                <td>
                  {location.managed ? (
                    <form action={toggleLocationStatusAction}>
                      <input type="hidden" name="locationId" value={location.id} />
                      <input
                        type="hidden"
                        name="nextStatus"
                        value={location.status === "active" ? "inactive" : "active"}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        type="submit"
                        disabled={location.isPrimary}
                        title={location.isPrimary ? "Primary location cannot be disabled" : undefined}
                      >
                        {location.status === "active" ? "Disable" : "Activate"}
                      </Button>
                    </form>
                  ) : (
                    <span className="text-muted">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Assignment workspace">
        {managedLocations.length === 0 ? (
          <p className="text-muted" style={{ marginBottom: 0 }}>
            Create a managed location to begin mapping inventory items and menu overrides to tenants.
          </p>
        ) : !canReadAssignments ? (
          <p className="text-muted" style={{ marginBottom: 0 }}>
            You need the <code>{readPermissionLabel}</code> permission to load assignments.
          </p>
        ) : accessibleLocations.length === 0 ? (
          <p className="text-muted" style={{ marginBottom: 0 }}>
            You are not currently assigned to any managed locations. Ask an administrator to share access before editing assignments.
          </p>
        ) : (
          <>
            <form
              method="get"
              className="portal-card__section"
              style={{ flexDirection: "row", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                Location
                <select name="locationId" defaultValue={selectedLocationId ?? ""}>
                  {accessibleLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <Button type="submit" size="sm">
                  Load assignments
                </Button>
              </div>
            </form>
            {assignmentSummary ? (
              <>
                <p className="text-muted">
                  Mapping inventory and menu data for <strong>{assignmentSummary.location.name}</strong>.
                </p>
                {!canManageSelectedLocation ? (
                  <p className="text-muted" style={{ marginTop: 0 }}>
                    You can review assignments for this location, but {manageRestrictionMessage}
                  </p>
                ) : null}
                <div className="portal-grid portal-grid--split">
                  <section className="portal-card__section" style={{ gap: "1rem" }}>
                    <div>
                      <h4 style={{ margin: 0 }}>Inventory assignments</h4>
                      <p className="text-muted" style={{ margin: 0 }}>
                        Assign stock items per location to prep counts and transfers.
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <form action={removeInventoryFromLocationAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <input type="hidden" name="locationId" value={assignmentSummary.location.id} />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          Assigned inventory
                          <select
                            name="inventoryItemIds"
                            multiple
                            size={multiSelectSize(assignmentSummary.inventory.assigned.length)}
                            disabled={!canManageSelectedLocation || assignmentSummary.inventory.assigned.length === 0}
                          >
                            {assignmentSummary.inventory.assigned.map((item) => (
                              <option key={item.itemId} value={item.itemId}>
                                {item.name} - {item.quantity} {item.unit}
                              </option>
                            ))}
                          </select>
                        </label>
                        {assignmentSummary.inventory.assigned.length === 0 ? (
                          <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                            Nothing assigned yet.
                          </span>
                        ) : null}
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          disabled={!canManageSelectedLocation || assignmentSummary.inventory.assigned.length === 0}
                        >
                          Remove selected
                        </Button>
                      </form>
                      <form action={assignInventoryToLocationAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <input type="hidden" name="locationId" value={assignmentSummary.location.id} />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          Available inventory
                          <select
                            name="inventoryItemIds"
                            multiple
                            size={multiSelectSize(assignmentSummary.inventory.available.length)}
                            disabled={!canManageSelectedLocation || assignmentSummary.inventory.available.length === 0}
                          >
                            {assignmentSummary.inventory.available.map((item) => (
                              <option key={item.itemId} value={item.itemId}>
                                {item.name} - baseline {item.baselineQuantity} {item.unit}
                              </option>
                            ))}
                          </select>
                        </label>
                        {assignmentSummary.inventory.available.length === 0 ? (
                          <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                            All items already assigned.
                          </span>
                        ) : null}
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!canManageSelectedLocation || assignmentSummary.inventory.available.length === 0}
                        >
                          Assign selected
                        </Button>
                      </form>
                    </div>
                  </section>
                  <section className="portal-card__section" style={{ gap: "1rem" }}>
                    <div>
                      <h4 style={{ margin: 0 }}>Menu assignments</h4>
                      <p className="text-muted" style={{ margin: 0 }}>
                        Map menu items per location to support unique pricing.
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <form action={removeMenuItemsFromLocationAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <input type="hidden" name="locationId" value={assignmentSummary.location.id} />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          Assigned menu items
                          <select
                            name="menuItemIds"
                            multiple
                            size={multiSelectSize(assignmentSummary.menu.assigned.length)}
                            disabled={!canManageSelectedLocation || assignmentSummary.menu.assigned.length === 0}
                          >
                            {assignmentSummary.menu.assigned.map((item) => (
                              <option key={item.menuItemId} value={item.menuItemId}>
                                {item.name} - {item.price.toFixed(2)} {item.currency}
                              </option>
                            ))}
                          </select>
                        </label>
                        {assignmentSummary.menu.assigned.length === 0 ? (
                          <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                            No overrides configured.
                          </span>
                        ) : null}
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          disabled={!canManageSelectedLocation || assignmentSummary.menu.assigned.length === 0}
                        >
                          Remove selected
                        </Button>
                      </form>
                      <form action={assignMenuItemsToLocationAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <input type="hidden" name="locationId" value={assignmentSummary.location.id} />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          Available menu items
                          <select
                            name="menuItemIds"
                            multiple
                            size={multiSelectSize(assignmentSummary.menu.available.length)}
                            disabled={!canManageSelectedLocation || assignmentSummary.menu.available.length === 0}
                          >
                            {assignmentSummary.menu.available.map((item) => (
                              <option key={item.menuItemId} value={item.menuItemId}>
                                {item.name} - default {item.defaultPrice.toFixed(2)} {item.currency}
                              </option>
                            ))}
                          </select>
                        </label>
                        {assignmentSummary.menu.available.length === 0 ? (
                          <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                            Every item already has a location override.
                          </span>
                        ) : null}
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!canManageSelectedLocation || assignmentSummary.menu.available.length === 0}
                        >
                          Assign selected
                        </Button>
                      </form>
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <p className="text-muted" style={{ marginBottom: 0 }}>
                Select a managed location to review assignments.
              </p>
            )}
          </>
        )}
      </Card>

      <Card title="Add a new location">
        <form action={createLocationAction} className="portal-card__section">
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Name
            <input type="text" name="name" required placeholder="Downtown" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Code
            <input type="text" name="code" required placeholder="downtown" />
            <span className="text-muted">Lowercase letters, numbers, or hyphens.</span>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Timezone
            <input type="text" name="timezone" defaultValue="UTC" placeholder="America/Los_Angeles" />
          </label>
          <div>
            <Button type="submit" size="sm">
              Save location
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
