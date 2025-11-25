import { describe, expect, it, vi } from "vitest";

vi.mock("@nova/module-registry", () => ({
  loadRegistry: () => ({
    version: "1.0.0",
    generated_at: "2025-10-03T00:00:00Z",
    modules: [
      {
        id: "inventory",
        name: "Inventory",
        category: "core",
        features: [
          { id: "items", name: "Items", actions: ["read", "create", "update"] },
          { id: "movements", name: "Movements", actions: ["create"] }
        ]
      }
    ],
    default_roles: []
  })
}));

const getModule = () => import("../index.js");

describe("@nova/rbac", () => {
  it("validates permission key format", async () => {
    const { permissionKeySchema } = await getModule();
    expect(permissionKeySchema.safeParse("inventory.items.read").success).toBe(true);
    expect(permissionKeySchema.safeParse("invalid").success).toBe(false);
  });

  it("checks permissions in 'all' mode", async () => {
    const { hasPermission } = await getModule();
    expect(
      hasPermission({
        permissions: ["inventory.items.read", "inventory.items.update"],
        required: ["inventory.items.read", "inventory.items.update"]
      })
    ).toBe(true);

    expect(
      hasPermission({
        permissions: ["inventory.items.read"],
        required: ["inventory.items.read", "inventory.items.update"]
      })
    ).toBe(false);
  });

  it("supports 'any' mode", async () => {
    const { hasPermission } = await getModule();
    expect(
      hasPermission({
        permissions: ["inventory.items.read"],
        required: ["inventory.items.update", "inventory.items.read"],
        mode: "any"
      })
    ).toBe(true);
  });

  it("honours wildcard permissions", async () => {
    const { hasPermission } = await getModule();
    expect(
      hasPermission({
        permissions: ["*"],
        required: ["inventory.items.create", "inventory.movements.create"]
      })
    ).toBe(true);
  });

  it("returns false for unknown or invalid required permissions", async () => {
    const { hasPermission } = await getModule();
    expect(
      hasPermission({
        permissions: ["inventory.items.read"],
        required: "billing.invoices.read"
      })
    ).toBe(false);

    expect(
      hasPermission({
        permissions: ["inventory.items.read"],
        required: "not-valid"
      })
    ).toBe(false);
  });

  it("builds a permission map filtering invalid entries", async () => {
    const { buildPermissionMap } = await getModule();
    const map = buildPermissionMap([
      "inventory.items.read",
      "invalid",
      "inventory.items.create"
    ]);
    expect(map).toEqual({
      "inventory.items.read": true,
      "inventory.items.create": true
    });
  });
});
