import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(moduleDir, "../../module-registry.json");
const fixture = {
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
    },
    {
      id: "pos",
      name: "Point of Sale",
      category: "core",
      dependencies: ["inventory"],
      features: [{ id: "tickets", name: "Tickets", actions: ["create", "refund"] }]
    }
  ],
  default_roles: []
};

let originalContent: string;

const writeFixture = () => writeFileSync(registryPath, JSON.stringify(fixture, null, 2));

beforeAll(() => {
  originalContent = readFileSync(registryPath, "utf8");
  writeFixture();
});

afterAll(() => {
  writeFileSync(registryPath, originalContent);
});

beforeEach(() => {
  writeFixture();
  vi.resetModules();
});

describe("@nova/module-registry", () => {
  it("loads registry and validates structure", async () => {
    const { loadRegistry } = await import("../index.js");
    const registry = loadRegistry();

    expect(registry.version).toBe("1.0.0");
    expect(registry.modules).toHaveLength(2);
    expect(registry.modules[0].features[0].actions).toEqual(["read", "create", "update"]);
  });

  it("returns a sorted list of permissions", async () => {
    const { listPermissions } = await import("../index.js");
    const permissions = listPermissions();

    expect(permissions).toEqual([
      "inventory.items.create",
      "inventory.items.read",
      "inventory.items.update",
      "inventory.movements.create",
      "pos.tickets.create",
      "pos.tickets.refund"
    ]);
  });

  it("reuses cache when available", async () => {
    const mod = await import("../index.js");
    const first = mod.loadRegistry();
    const second = mod.loadRegistry();
    expect(second).toBe(first);
  });
});
