import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";

const connectMock = vi.fn();

vi.mock("../../../db.js", () => ({
  pool: {
    connect: connectMock
  }
}));

let getLocationAssignmentSummary: (typeof import("../data.js"))["getLocationAssignmentSummary"];
let mutateLocationAssignments: (typeof import("../data.js"))["mutateLocationAssignments"];

beforeAll(async () => {
  ({ getLocationAssignmentSummary, mutateLocationAssignments } = await import("../data.js"));
});

const buildClient = (responses: Array<unknown>) => {
  const query = vi.fn();
  for (const value of responses) {
    query.mockResolvedValueOnce(value);
  }
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    query,
    release: vi.fn()
  };
};

describe("portal assignment data helpers", () => {
  afterEach(() => {
    connectMock.mockReset();
  });

  it("returns summaries with inventory and menu data", async () => {
    const summaryClient = buildClient([
      {
        rows: [
          {
            id: "loc-managed",
            name: "Downtown",
            code: "downtown",
            timezone: "UTC",
            status: "active",
            total_inventory_items: 5,
            total_menu_items: 2
          }
        ]
      },
      {
        rows: [
          {
            item_id: "inv-assigned",
            name: "Beans",
            sku: "BEANS",
            unit: "lb",
            quantity: 10,
            reserved: 1,
            on_order: 0
          }
        ]
      },
      {
        rows: [
          {
            item_id: "inv-available",
            name: "Milk",
            sku: "MILK",
            unit: "gal",
            baseline_quantity: 4
          }
        ]
      },
      {
        rows: [
          {
            menu_item_id: "menu-assigned",
            name: "Latte",
            category: "Coffee",
            price: 5,
            currency: "USD"
          }
        ]
      },
      {
        rows: [
          {
            menu_item_id: "menu-available",
            name: "Cold Brew",
            category: "Coffee",
            default_price: 4.5,
            currency: "USD"
          }
        ]
      }
    ]);

    connectMock.mockResolvedValue(summaryClient);

    const result = await getLocationAssignmentSummary(
      "tenant-1",
      "loc-managed",
      {} as FastifyBaseLogger
    );

    expect(result.location.name).toBe("Downtown");
    expect(result.inventory.assigned[0].itemId).toBe("inv-assigned");
    expect(result.inventory.available[0].itemId).toBe("inv-available");
    expect(result.menu.assigned[0].menuItemId).toBe("menu-assigned");
    expect(result.menu.available[0].menuItemId).toBe("menu-available");
    expect(summaryClient.release).toHaveBeenCalledTimes(1);
  });

  it("executes assignment mutations inside a transaction", async () => {
    const mutationClient = buildClient([
      {},
      { rowCount: 1 },
      {},
      {},
      {},
      {},
      {}
    ]);

    connectMock.mockResolvedValue(mutationClient);

    await mutateLocationAssignments(
      "tenant-1",
      "loc-managed",
      {} as FastifyBaseLogger,
      {
        assignInventory: ["inv-new"],
        removeInventory: [],
        assignMenuItems: [],
        removeMenuItems: ["menu-old"]
      }
    );

    expect(mutationClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mutationClient.query).toHaveBeenCalledWith("COMMIT");
    expect(
      mutationClient.query.mock.calls.some((call) => {
        const [sql] = call;
        return typeof sql === "string" && sql.includes("INSERT INTO inventory_stock_levels");
      })
    ).toBe(true);
    expect(
      mutationClient.query.mock.calls.some((call) => {
        const [sql] = call;
        return typeof sql === "string" && sql.includes("DELETE FROM menu_item_prices");
      })
    ).toBe(true);
  });
});
