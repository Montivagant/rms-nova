import { Button, Card } from "@nova/design-system";
import {
  getMenuData,
  getMenuModifiers,
  getMenuModifierAssignments,
  getPortalContext,
  getLocationSummaries
} from "@lib/data-sources";
import { ensureModuleEnabled } from "@lib/module-guards";
import { hasPermission, formatPermissionRequirement } from "@lib/capabilities";
import {
  toggleMenuItemStatusAction,
  editMenuItemAction,
  createMenuItemAction,
  updateMenuItemModifiersAction,
  createMenuModifierAction
} from "./actions";

export default async function MenuPage() {
  const context = await getPortalContext();
  ensureModuleEnabled(context, "menu");
  const [items, locations, modifiers, modifierAssignments] = await Promise.all([
    getMenuData(),
    getLocationSummaries(),
    getMenuModifiers(),
    getMenuModifierAssignments()
  ]);
  const canManageMenu = hasPermission(context, ["menu.items.create", "menu.items.update"]);
  const manageMenuRequirement = formatPermissionRequirement("menu.items.create");
  const menuEditRequirement = formatPermissionRequirement("menu.items.update");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hasValidMenuIds = items.every((item) => uuidPattern.test(item.id));
  const validLocations = locations
    .filter((location) => location.status === "active" && uuidPattern.test(location.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const createDisabled = !canManageMenu;
  const editDisabled = !canManageMenu || !hasValidMenuIds || items.length === 0;
  const modifierFormDisabled = !canManageMenu || !hasValidMenuIds || modifiers.length === 0;
  const formatModifierPrice = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Menu</h2>
          <p className="text-muted">Live tenant menu data (falls back to the sample kit when empty).</p>
        </div>
      </div>

      <Card title="Create menu item">
        <p className="text-muted">Add new menu entries that default to the base price unless you choose a location override.</p>
        {!canManageMenu ? (
          <p className="text-muted">Requires {manageMenuRequirement} before any new items can be added.</p>
        ) : null}
        <form action={createMenuItemAction} className="menu-create-form">
          <label>
            Name
            <input
              type="text"
              name="name"
              required
              maxLength={80}
              placeholder="e.g., Iced Latte"
              disabled={createDisabled}
            />
          </label>
          <label>
            Category
            <input
              type="text"
              name="categoryName"
              maxLength={64}
              placeholder="Coffee Bar"
              disabled={createDisabled}
            />
          </label>
          <label>
            Price (USD)
            <input
              type="number"
              step="0.01"
              min="0.5"
              name="price"
              required
              placeholder="$5.25"
              disabled={createDisabled}
            />
          </label>
          <label>
            Tax rate (%)
            <input
              type="number"
              step="0.1"
              min="0"
              name="taxRate"
              placeholder="8.5"
              disabled={createDisabled}
            />
          </label>
          <label>
            Currency
            <input
              type="text"
              name="currency"
              maxLength={3}
              placeholder="USD"
              disabled={createDisabled}
            />
          </label>
          <label>
            Location override
            <select
              name="locationId"
              defaultValue=""
              disabled={createDisabled || validLocations.length === 0}
            >
              <option value="">Primary / default</option>
              {validLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input
              type="text"
              name="description"
              maxLength={256}
              placeholder="Optional description"
              disabled={createDisabled}
            />
          </label>
          <Button
            type="submit"
            disabled={createDisabled}
            title={!canManageMenu ? `Requires ${manageMenuRequirement}` : undefined}
          >
            Create item
          </Button>
        </form>
      </Card>

      <Card title="Create modifier">
        <p className="text-muted">
          Define reusable modifiers (prices can be positive or negative) that you can then assign to menu items below.
        </p>
        <form action={createMenuModifierAction} className="menu-create-form">
          <label>
            Name
            <input type="text" name="name" required maxLength={80} placeholder="Extra Shot" disabled={!canManageMenu} />
          </label>
          <label>
            Price delta (USD)
            <input
              type="number"
              step="0.25"
              name="priceDelta"
              placeholder="1.50"
              defaultValue="0"
              disabled={!canManageMenu}
            />
          </label>
          <label>
            Max selectable (optional)
            <input type="number" min="0" name="maxSelect" placeholder="Leave blank for unlimited" disabled={!canManageMenu} />
          </label>
          <Button type="submit" disabled={!canManageMenu} title={!canManageMenu ? `Requires ${menuEditRequirement}` : undefined}>
            Create modifier
          </Button>
        </form>
      </Card>

      <Card title="Active items">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
              <th>Sold (today)</th>
              <th>Gross (today)</th>
              <th>Recipe</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.price}</td>
                <td>
                  <span
                    className={`badge ${item.isActive ? "badge--success" : "badge--warning"}`}
                    title={`Tax: ${item.taxRate}`}
                  >
                    {item.status}
                  </span>
                </td>
                <td>{item.soldToday}</td>
                <td>{item.grossToday}</td>
                <td>
                  <span className={`badge ${item.recipeLinked ? "badge--success" : "badge--warning"}`}>
                    {item.recipeLinked ? "Linked" : "Missing"}
                  </span>
                </td>
                <td>
                  <form action={toggleMenuItemStatusAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input
                      type="hidden"
                      name="nextStatus"
                      value={item.isActive ? "inactive" : "active"}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      type="submit"
                      disabled={!canManageMenu}
                      title={!canManageMenu ? `Requires ${manageMenuRequirement}` : undefined}
                    >
                      {item.isActive ? "Disable" : "Activate"}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Edit menu item">
        <p className="text-muted">
          Update menu names, pricing, and taxes for the tenant (and optionally override prices for managed locations).
        </p>
        {!hasValidMenuIds ? (
          <p className="text-muted">
            Start the API or reseed tenant data to unlock menu editing&mdash;sample dataset ids stay read-only.
          </p>
        ) : null}
        {!canManageMenu ? (
          <p className="text-muted">Requires {menuEditRequirement} before any edits are enabled.</p>
        ) : null}
        <form action={editMenuItemAction} className="menu-edit-form">
          <label>
            Menu item
            <select name="itemId" required disabled={editDisabled}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input type="text" name="name" maxLength={80} placeholder="e.g., Iced Latte" disabled={editDisabled} />
          </label>
          <label>
            Price (USD)
            <input
              type="number"
              step="0.01"
              min="0.5"
              name="price"
              placeholder="$5.25"
              disabled={editDisabled}
            />
          </label>
          <label>
            Tax rate (%)
            <input
              type="number"
              step="0.1"
              min="0"
              name="taxRate"
              placeholder="8.5"
              disabled={editDisabled}
            />
          </label>
          <label>
            Currency
            <input
              type="text"
              name="currency"
              maxLength={3}
              placeholder="USD"
              disabled={editDisabled}
            />
          </label>
          <label>
            Location override
            <select name="locationId" defaultValue="" disabled={editDisabled || validLocations.length === 0}>
              <option value="">Primary / default</option>
              {validLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input
              type="text"
              name="description"
              maxLength={256}
              placeholder="Optional helper copy"
              disabled={editDisabled}
            />
          </label>
          <Button
            type="submit"
            disabled={editDisabled}
            title={!canManageMenu ? `Requires ${menuEditRequirement}` : undefined}
          >
            Save changes
          </Button>
        </form>
      </Card>

      <Card title="Modifier assignments">
        <p className="text-muted">
          Toggle the modifiers available for each menu item. Create modifiers in the superadmin console before wiring them here.
        </p>
        {modifiers.length === 0 ? (
          <p className="text-muted">No modifiers defined yet.</p>
        ) : (
          items.map((item) => {
            if (!uuidPattern.test(item.id)) {
              return (
                <div key={`modifiers-${item.id}`} className="text-muted">
                  {item.name} uses sample data; modifiers are disabled until real IDs exist.
                </div>
              );
            }
            const assigned = new Set(modifierAssignments[item.id] ?? []);
            return (
              <form
                key={`mod-form-${item.id}`}
                action={updateMenuItemModifiersAction}
                className="menu-modifiers-form"
              >
                <input type="hidden" name="itemId" value={item.id} />
                <div>
                  <strong>{item.name}</strong>
                  <div className="text-muted">{item.category}</div>
                </div>
                <div className="menu-modifiers-form__grid">
                  {modifiers.map((modifier) => (
                    <label key={`${item.id}-${modifier.id}`} className="menu-modifiers-form__option">
                      <input
                        type="checkbox"
                        name="modifierIds"
                        value={modifier.id}
                        defaultChecked={assigned.has(modifier.id)}
                        disabled={modifierFormDisabled}
                      />
                      <span>
                        {modifier.name}
                        {modifier.priceDelta !== 0
                          ? ` (${modifier.priceDelta > 0 ? "+" : ""}${formatModifierPrice(modifier.priceDelta)})`
                          : ""}
                      </span>
                    </label>
                  ))}
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={modifierFormDisabled}
                  title={!canManageMenu ? `Requires ${menuEditRequirement}` : undefined}
                >
                  Save modifiers
                </Button>
              </form>
            );
          })
        )}
      </Card>
    </div>
  );
}
