import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  getDashboardSnapshot,
  getMenuItems as getSampleMenuItems,
  getMenuModifiers as getSampleMenuModifiers,
  getMenuModifierAssignments as getSampleAssignments,
  getTicketFeed as getSampleTickets,
  getPaymentsSnapshot,
  getReportingSnapshot,
  getInventoryItems as getSampleInventory,
  getInventoryAuditLog,
  type MenuItem,
  type MenuModifier,
  type PaymentsSnapshot,
  type PaymentRecord
} from "@nova/sample-data";

interface MenuItemState extends MenuItem {
  id: string;
}

interface ModifierState extends MenuModifier {
  id: string;
}

interface PortalMockState {
  items: MenuItemState[];
  modifiers: ModifierState[];
  assignments: Record<string, string[]>;
  payments: PaymentsSnapshot;
}

export const PORTAL_MOCK_API_HOST = process.env.PLAYWRIGHT_PORTAL_API_HOST ?? "127.0.0.1";
export const PORTAL_MOCK_API_PORT = Number(process.env.PLAYWRIGHT_PORTAL_API_PORT ?? "3999");
export const PORTAL_MOCK_API_BASE_URL = `http://${PORTAL_MOCK_API_HOST}:${PORTAL_MOCK_API_PORT}`;

const MOCK_LOCATIONS = [
  {
    id: "loc-primary",
    name: "Downtown",
    code: "downtown",
    timezone: "America/Los_Angeles",
    status: "active",
    totalInventoryItems: 12,
    totalMenuItems: 8,
    isPrimary: true,
    managed: true
  },
  {
    id: "loc-roastery",
    name: "Roastery",
    code: "roastery",
    timezone: "America/Los_Angeles",
    status: "active",
    totalInventoryItems: 8,
    totalMenuItems: 6,
    isPrimary: false,
    managed: true
  }
];

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const formatTax = (value: number) => `${value}%`;

const cloneMenuItem = (item: MenuItem): MenuItemState => ({
  ...item,
  id: randomUUID(),
  price: item.price,
  taxRate: item.taxRate
});

const cloneModifier = (modifier: MenuModifier): ModifierState => ({
  ...modifier,
  id: randomUUID()
});

const clonePaymentRecord = (record: PaymentRecord): PaymentRecord => ({
  ...record,
  metadata: record.metadata ? { ...record.metadata } : undefined
});

const clonePaymentsSnapshot = (): PaymentsSnapshot => {
  const snapshot = getPaymentsSnapshot();
  return {
    summary: {
      ...snapshot.summary,
      methods: snapshot.summary.methods.map((entry) => ({ ...entry }))
    },
    payments: snapshot.payments.map((payment) => clonePaymentRecord(payment))
  };
};

const createInitialState = (): PortalMockState => {
  const itemIdMap = new Map<string, string>();
  const modifierIdMap = new Map<string, string>();

  const modifiers = getSampleMenuModifiers().map((modifier) => {
    const cloned = cloneModifier(modifier);
    modifierIdMap.set(modifier.id, cloned.id);
    return cloned;
  });

  const items = getSampleMenuItems().map((item) => {
    const cloned = cloneMenuItem(item);
    itemIdMap.set(item.id, cloned.id);
    return cloned;
  });

  const assignments: Record<string, string[]> = {};
  const sampleAssignments = getSampleAssignments();
  for (const [legacyItemId, modifierList] of Object.entries(sampleAssignments)) {
    const newItemId = itemIdMap.get(legacyItemId);
    if (!newItemId) continue;
    assignments[newItemId] = modifierList
      .map((legacyModifierId) => modifierIdMap.get(legacyModifierId))
      .filter((value): value is string => Boolean(value));
  }

  return { items, modifiers, assignments, payments: clonePaymentsSnapshot() };
};

const sendJson = (res: ServerResponse, data: unknown, status = 200) => {
  const body = JSON.stringify({ data });
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
};

const sendNotFound = (res: ServerResponse) => {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
};

const parseRequestBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
};

const toNumber = (value: string | number | undefined | null, fallback = 0) => {
  if (value === undefined || value === null) return fallback;
  const result = typeof value === "number" ? value : Number(value);
  return Number.isNaN(result) ? fallback : result;
};

const parseCurrency = (value?: string) => {
  if (!value) return 0;
  const normalized = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(normalized) ? normalized : 0;
};

export const createPortalMockServer = () => {
  let state = createInitialState();

  const resetState = () => {
    state = createInitialState();
  };

  const server = createServer(async (req, res) => {
    if (!req.url) return sendNotFound(res);
    const url = new URL(req.url, PORTAL_MOCK_API_BASE_URL);
    const { pathname } = url;

    try {
      if (req.method === "GET" && pathname === "/healthz") {
        return sendJson(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/__mock__/reset") {
        resetState();
        return sendJson(res, { reset: true });
      }

      if (pathname === "/v1/portal/menu/items") {
        if (req.method === "GET") {
          return sendJson(res, state.items);
        }
        if (req.method === "POST") {
          const body = await parseRequestBody(req);
          const newItem: MenuItemState = {
            id: randomUUID(),
            name: body.name ?? "New Item",
            category: body.categoryName ?? "Uncategorized",
            price: formatPrice(toNumber(body.price)),
            taxRate: formatTax(toNumber(body.taxRate)),
            status: "Available",
            isActive: true,
            soldToday: 0,
            grossToday: "$0.00",
            recipeLinked: false
          };
          state.items.push(newItem);
          state.assignments[newItem.id] = [];
          return sendJson(res, newItem, 201);
        }
      }

      const menuItemPatchMatch = pathname.match(/^\/v1\/portal\/menu\/items\/([^/]+)$/);
      if (menuItemPatchMatch) {
        const itemId = menuItemPatchMatch[1];
        const item = state.items.find((entry) => entry.id === itemId);
        if (!item) return sendNotFound(res);

        if (req.method === "PATCH") {
          const body = await parseRequestBody(req);
          if (body.name) item.name = body.name;
          if (body.price !== undefined) item.price = formatPrice(toNumber(body.price));
          if (body.taxRate !== undefined) item.taxRate = formatTax(toNumber(body.taxRate));
          return sendJson(res, {
            itemId: item.id,
            name: item.name,
            price: item.price,
            taxRate: item.taxRate
          });
        }
      }

      if (pathname === "/v1/portal/menu/modifiers") {
        if (req.method === "GET") return sendJson(res, state.modifiers);
        if (req.method === "POST") {
          const body = await parseRequestBody(req);
          const newModifier: ModifierState = {
            id: randomUUID(),
            name: body.name ?? "New Modifier",
            priceDelta: toNumber(body.priceDelta),
            maxSelect:
              body.maxSelect === undefined || body.maxSelect === null || body.maxSelect === ""
                ? null
                : toNumber(body.maxSelect)
          };
          state.modifiers.push(newModifier);
          return sendJson(res, newModifier, 201);
        }
      }

      if (pathname === "/v1/portal/menu/modifiers/assignments" && req.method === "GET") {
        return sendJson(res, state.assignments);
      }

      const menuModifierMatch = pathname.match(/^\/v1\/portal\/menu\/items\/([^/]+)\/modifiers$/);
      if (menuModifierMatch && req.method === "POST") {
        const itemId = menuModifierMatch[1];
        const body = await parseRequestBody(req);
        state.assignments[itemId] = (body.modifierIds ?? []).filter((id: string) =>
          state.modifiers.some((modifier) => modifier.id === id)
        );
        return sendJson(res, { itemId, modifierIds: state.assignments[itemId] });
      }

      if (pathname === "/v1/portal/context" && req.method === "GET") {
        return sendJson(res, {
          tenant: {
            id: "tenant-playwright",
            name: "Playwright Coffee",
            alias: "playwright",
            status: "active",
            planName: "Pro",
            planId: "plan-pro",
            subscriptionStatus: "active",
            locationCount: MOCK_LOCATIONS.length,
            nextPayout: "Nov 15",
            nextPayoutAt: new Date().toISOString()
          },
          modules: [
            { moduleId: "dashboard", enabled: true, source: "plan" },
            { moduleId: "menu", enabled: true, source: "plan" },
            { moduleId: "inventory", enabled: true, source: "plan" },
            { moduleId: "pos", enabled: true, source: "plan" },
            { moduleId: "locations", enabled: true, source: "plan" },
            { moduleId: "payments", enabled: true, source: "plan" },
            { moduleId: "reports", enabled: true, source: "plan" }
          ],
          featureFlags: [
            { moduleId: "global", featureKey: "multi_location", enabled: true },
            { moduleId: "reporting", featureKey: "advanced_reporting", enabled: true }
          ],
          permissions: [
            "menu.items.create",
            "menu.items.update",
            "inventory.locations.read",
            "inventory.locations.manage_assignments",
            "inventory.movements.create",
            "pos.tickets.create",
            "pos.tickets.open",
            "pos.payments.refund"
          ],
          roles: ["owner"],
          locationAccess: {
            isScoped: false,
            allowedLocationIds: [],
            manageableLocationIds: []
          }
        });
      }

      if (pathname === "/v1/portal/dashboard" && req.method === "GET") {
        return sendJson(res, getDashboardSnapshot());
      }

      if (pathname === "/v1/portal/locations" && req.method === "GET") {
        return sendJson(res, MOCK_LOCATIONS);
      }

      const locationAssignmentsMatch = pathname.match(/^\/v1\/portal\/locations\/([^/]+)\/assignments$/);
      if (locationAssignmentsMatch && req.method === "GET") {
        const locationId = locationAssignmentsMatch[1];
        const location = MOCK_LOCATIONS.find((entry) => entry.id === locationId) ?? MOCK_LOCATIONS[0];
        const data = {
          location,
          inventory: {
            assigned: [] as Array<{
              itemId: string;
              name: string;
              sku: string | null;
              unit: string;
              quantity: number;
              reserved: number;
              onOrder: number;
            }>,
            available: getSampleInventory().map((item) => ({
              itemId: item.id,
              name: item.name,
              sku: null,
              unit: item.unit,
              baselineQuantity: item.onHand
            }))
          },
          menu: {
            assigned: state.items.slice(0, 2).map((item) => ({
              menuItemId: item.id,
              name: item.name,
              category: item.category,
              price: Number(item.price.replace(/[^0-9.-]+/g, "")),
              currency: "USD"
            })),
            available: state.items.slice(2).map((item) => ({
              menuItemId: item.id,
              name: item.name,
              category: item.category,
              defaultPrice: Number(item.price.replace(/[^0-9.-]+/g, "")),
              currency: "USD"
            }))
          }
        };
        return sendJson(res, data);
      }

      if (pathname === "/v1/portal/pos/tickets" && req.method === "GET") {
        return sendJson(res, getSampleTickets());
      }

      if (pathname === "/v1/portal/inventory/items" && req.method === "GET") {
        const payload = getSampleInventory().map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          onHand: item.onHand,
          parLevel: item.parLevel,
          costPerUnit: item.costPerUnit
        }));
        return sendJson(res, payload);
      }

      if (pathname === "/v1/portal/inventory/audit" && req.method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? "10");
        const locationId = url.searchParams.get("locationId");
        let entries = getInventoryAuditLog();
        if (locationId) {
          entries = entries.filter((entry) => entry.locationId === locationId);
        }
        const size = Math.max(1, Math.min(limit, 50));
        return sendJson(res, entries.slice(0, size));
      }

      if (pathname === "/v1/portal/payments") {
        if (req.method === "GET") {
          const limit = Math.max(5, Math.min(Number(url.searchParams.get("limit") ?? "15"), 50));
          const methodFilter = url.searchParams.get("method");
          const filtered = state.payments.payments.filter((payment) => {
            if (!methodFilter) return true;
            return payment.method.toLowerCase() === methodFilter.toLowerCase();
          });
          const limited = filtered.slice(0, limit);
          const rangeTotal = limited.reduce(
            (total, payment) =>
              total +
              (payment.totalAmountValue ??
                parseCurrency(payment.amount) +
                  parseCurrency(payment.tipAmount)),
            0
          );
          return sendJson(res, {
            summary: {
              ...state.payments.summary,
              rangeTotal: formatPrice(rangeTotal)
            },
            payments: limited
          });
        }
      }

      const refundMatch = pathname.match(/^\/v1\/portal\/pos\/payments\/([^/]+)\/refunds$/);
      if (refundMatch && req.method === "POST") {
        const paymentId = refundMatch[1];
        const body = await parseRequestBody(req);
        const requestedAmount = Number(body.amount ?? 0);
        const payment = state.payments.payments.find((entry) => entry.id === paymentId);
        if (!payment) {
          return sendNotFound(res);
        }
        const totalAmount =
          payment.totalAmountValue ??
          parseCurrency(payment.amount) + parseCurrency(payment.tipAmount);
        const refundedAmount = payment.refundedAmountValue ?? parseCurrency(payment.refundedAmount);
        const remainingBefore = Math.max(totalAmount - refundedAmount, 0);
        const appliedAmount =
          Number.isFinite(requestedAmount) && requestedAmount > 0
            ? Math.min(requestedAmount, remainingBefore)
            : remainingBefore;
        const newRefundedTotal = refundedAmount + appliedAmount;
        const remainingAfter = Math.max(totalAmount - newRefundedTotal, 0);
        payment.refundedAmountValue = newRefundedTotal;
        payment.refundedAmount = formatPrice(newRefundedTotal);
        payment.remainingAmountValue = remainingAfter;
        if (remainingAfter <= 0) {
          payment.status = "Refunded";
        }
        return sendJson(res, {
          refundId: randomUUID(),
          paymentId,
          amount: appliedAmount,
          status: remainingAfter <= 0 ? "completed" : "pending",
          remainingAmount: remainingAfter
        });
      }

      if (pathname === "/v1/portal/reporting" && req.method === "GET") {
        return sendJson(res, getReportingSnapshot());
      }

      return sendNotFound(res);
    } catch (error) {
      console.error("[mock-portal-api] error handling request", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "mock_api_failure" }));
    }
  });

  return {
    server,
    resetState,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("error", onError);
          reject(error);
        };
        server.once("error", onError);
        server.listen(PORTAL_MOCK_API_PORT, PORTAL_MOCK_API_HOST, () => {
          server.off("error", onError);
          resolve();
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
  };
};

export type PortalMockServer = ReturnType<typeof createPortalMockServer>;
