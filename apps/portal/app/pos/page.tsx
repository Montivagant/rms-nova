import { Button, Card } from "@nova/design-system";
import {
  getTicketData,
  getPortalContext,
  getMenuItemsData,
  getLocationSummaries
} from "@lib/data-sources";
import { ensureModuleEnabled } from "@lib/module-guards";
import { hasPermission, formatPermissionRequirement } from "@lib/capabilities";
import { recordQuickSaleAction } from "./actions";

export default async function PosPage() {
  const context = await getPortalContext();
  ensureModuleEnabled(context, "pos");
  const [tickets, menuItems, locationSummaries] = await Promise.all([
    getTicketData(),
    getMenuItemsData(),
    getLocationSummaries()
  ]);
  const activeMenuItems = menuItems.filter((item) => item.status === "Available");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hasValidMenuIds = activeMenuItems.every((item) => uuidPattern.test(item.id));
  const validLocations = locationSummaries
    .filter((location) => location.status === "active")
    .filter((location) => uuidPattern.test(location.id));
  const managedLocations = validLocations.filter((location) => location.managed);
  const selectableLocations = managedLocations.length > 0 ? managedLocations : validLocations;
  const defaultLocationId = selectableLocations[0]?.id ?? "";
  const noValidLocations = selectableLocations.length === 0;
  const canOpenRegister = hasPermission(context, ["pos.tickets.create", "pos.tickets.open"]);
  const canCreateTicket = hasPermission(context, ["pos.tickets.create"]);
  const posRequirement = formatPermissionRequirement("pos.tickets.create");
  const saleDisabled =
    !canCreateTicket || !activeMenuItems.length || !hasValidMenuIds || noValidLocations;

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Point of Sale</h2>
          <p className="text-muted">Live ticket feed and tender breakdown (falls back to the sample kit when empty).</p>
        </div>
        <Button
          disabled={!canOpenRegister}
          title={!canOpenRegister ? `Requires ${posRequirement}` : undefined}
        >
          Open register
        </Button>
      </div>

      <Card title="Quick sale">
        <p className="text-muted">
          Records a settled ticket against the connected API with automatic payment + reporting updates. Add a loyalty
          customer to automatically award points when the sale settles.
        </p>
        {!hasValidMenuIds ? (
          <p className="text-muted">
            Start the API (or reseed real menu data) before recording sales—sample menu ids are disabled to avoid
            invalid ticket entries.
          </p>
        ) : null}
        {!canCreateTicket ? (
          <p className="text-muted">Requires {posRequirement} before the controls below are enabled.</p>
        ) : null}
        {!activeMenuItems.length ? (
          <p className="text-muted">Add active menu items to enable the quick sale workflow.</p>
        ) : null}
        {noValidLocations ? (
          <p className="text-muted">
            Add an active managed location (Locations workspace) or rerun the sample data seed before recording sales.
          </p>
        ) : null}
        <form action={recordQuickSaleAction} className="pos-sale-form">
          <label>
            Menu item
            <select
              name="menuItemId"
              defaultValue={activeMenuItems[0]?.id}
              required
              disabled={saleDisabled}
            >
              {activeMenuItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              step="0.5"
              min="0.5"
              name="quantity"
              defaultValue="1"
              required
              disabled={saleDisabled}
            />
          </label>
          <label>
            Payment method
            <select name="paymentMethod" defaultValue="Card" required disabled={saleDisabled}>
              <option value="Card">Card</option>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
            </select>
          </label>
          <label>
            Tip amount
            <input
              type="number"
              step="0.25"
              min="0"
              name="tipAmount"
              placeholder="$0.00"
              disabled={saleDisabled}
            />
          </label>
          <label>
            Location
            <select
              name="locationId"
              defaultValue={defaultLocationId}
              disabled={saleDisabled || noValidLocations}
            >
              {selectableLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <input type="text" name="notes" maxLength={256} placeholder="Optional note" disabled={saleDisabled} />
          </label>
          <label>
            Loyalty customer (optional)
            <input
              type="text"
              name="loyaltyCustomerId"
              maxLength={160}
              placeholder="customer@example.com"
              disabled={saleDisabled}
            />
          </label>
          <Button
            type="submit"
            disabled={saleDisabled}
            title={!canCreateTicket ? `Requires ${posRequirement}` : undefined}
          >
            Record sale
          </Button>
        </form>
      </Card>

      <Card title="Recent tickets">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Total</th>
              <th>Processed</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
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
                <td>{ticket.processedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
