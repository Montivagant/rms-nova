import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Errors } from "../../../errors.js";
vi.mock("../../queues/payment-status.js", () => ({
  enqueuePaymentStatusJob: vi.fn().mockResolvedValue(undefined)
}));
const dashboardFixture = vi.hoisted(() => ({
  metrics: [
    {
      label: "Today's Revenue",
      value: "$0",
      trend: "up" as const,
      delta: "No tickets yet",
      helper: "Run your first sale"
    }
  ],
  topMenuItems: [],
  inventoryAlerts: [],
  recentTickets: []
}));

const menuFixture = vi.hoisted(() => [
  {
    id: "item-1",
    name: "Latte",
    category: "Coffee",
    price: "$5.00",
    taxRate: "8%",
    status: "Available",
    soldToday: 0,
    grossToday: "$0.00",
    recipeLinked: true
  }
]);

const inventoryFixture = vi.hoisted(() => [
  {
    id: "inv-1",
    name: "Beans",
    unit: "lb",
    onHand: 10,
    parLevel: 5,
    costPerUnit: "$8.00"
  }
]);

const ticketsFixture = vi.hoisted(() => [
  {
    id: "ticket-1",
    channel: "POS",
    status: "Paid",
    total: "$10.00",
    processedAt: "09:00",
    items: [{ name: "Latte", quantity: 1 }]
  }
]);

const paymentsFixture = vi.hoisted(() => ({
  summary: {
    totalToday: "$52.15",
    totalWeek: "$412.40",
    methods: [
      { method: "Card", amount: "$310.20" },
      { method: "Cash", amount: "$82.70" }
    ]
  },
  payments: [
    {
      id: "pay-1",
      ticketId: "#123",
      method: "Card",
      status: "Completed",
      amount: "$32.40",
      amountValue: 32.4,
      tipAmount: "$2.50",
      tipAmountValue: 2.5,
      totalAmountValue: 34.9,
      refundedAmount: "$5.00",
      refundedAmountValue: 5,
      remainingAmountValue: 29.9,
      currency: "USD",
      processedAt: "09:42"
    }
  ]
}));

const reportingFixture = vi.hoisted(() => ({
  revenueSeries: [
    { date: "Nov 02", total: "$2,310" },
    { date: "Nov 03", total: "$2,640" }
  ],
  ticketSeries: [
    { date: "Nov 02", count: 138 },
    { date: "Nov 03", count: 145 }
  ],
  topCategories: [
    { category: "Coffee Bar", revenue: "$14,520" },
    { category: "Kitchen Favorites", revenue: "$9,880" }
  ]
}));

const loyaltyAccountId = vi.hoisted(() => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

const loyaltyOverviewFixture = vi.hoisted(() => ({
  rules: {
    earnRate: 1,
    redeemRate: 0.01,
    minRedeemPoints: 25,
    expirationDays: null,
    status: "active",
    updatedAt: new Date().toISOString()
  },
  stats: {
    totalAccounts: 2,
    activeAccounts: 2,
    totalPoints: 480
  },
  accounts: [
    {
      id: loyaltyAccountId,
      externalCustomerId: "avery@example.com",
      balance: 320,
      pendingBalance: 0,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null
    }
  ]
}));

const loyaltyAccountDetailFixture = vi.hoisted(() => ({
  account: loyaltyOverviewFixture.accounts[0],
  transactions: [
    {
      id: "txn-1",
      type: "earn",
      points: 50,
      balanceAfter: 320,
      reference: "ticket-1",
      source: "pos",
      metadata: { actorId: "user-1" },
      createdAt: new Date().toISOString()
    }
  ]
}));

const primaryLocationId = vi.hoisted(() => "11111111-1111-1111-1111-111111111111");
const managedLocationId = vi.hoisted(() => "22222222-2222-2222-2222-222222222222");
const inventoryCountId = vi.hoisted(() => "77777777-7777-7777-7777-777777777777");
const assignedInventoryId = vi.hoisted(() => "33333333-3333-3333-3333-333333333333");
const availableInventoryId = vi.hoisted(() => "33333333-3333-3333-3333-444444444444");
const assignedMenuItemId = vi.hoisted(() => "55555555-5555-5555-5555-555555555555");
const availableMenuItemId = vi.hoisted(() => "55555555-5555-5555-5555-666666666666");

const contextFixture = vi.hoisted(() => ({
  tenant: {
    id: "tenant-1",
    name: "Demo Coffee Collective",
    alias: "demo-coffee",
    status: "active",
    planName: "Core",
    planId: "plan-core",
    subscriptionStatus: "active",
    locationCount: 2,
    nextPayout: "Nov 09, 2025",
    nextPayoutAt: "2025-11-09T00:00:00.000Z"
  },
  modules: [
    { moduleId: "pos", enabled: true, source: "plan" },
    { moduleId: "inventory", enabled: false, source: "plan" }
  ],
  featureFlags: [],
  permissions: ["pos.tickets.read"],
  roles: ["owner"]
}));

const locationsFixture = vi.hoisted(() => [
  {
    id: primaryLocationId,
    name: "Primary Location",
    code: "primary",
    timezone: "UTC",
    status: "active",
    totalInventoryItems: 5,
    totalMenuItems: 3,
    isPrimary: true,
    managed: true
  }
]);

const createdLocationFixture = vi.hoisted(() => ({
  id: managedLocationId,
  name: "Roastery",
  code: "roastery",
  timezone: "America/Los_Angeles",
  status: "active",
  totalInventoryItems: 0,
  totalMenuItems: 0,
  isPrimary: false,
  managed: true
}));

const locationAssignmentFixture = vi.hoisted(() => ({
  location: createdLocationFixture,
  inventory: {
    assigned: [
      {
        itemId: assignedInventoryId,
        name: "Beans",
        sku: "BEANS-1",
        unit: "lb",
        quantity: 25,
        reserved: 0,
        onOrder: 0
      }
    ],
    available: [
      {
        itemId: availableInventoryId,
        name: "Milk",
        sku: "MILK-1",
        unit: "gal",
        baselineQuantity: 10
      }
    ]
  },
  menu: {
    assigned: [
      {
        menuItemId: assignedMenuItemId,
        name: "Latte",
        category: "Coffee",
        price: 5,
        currency: "USD"
      }
    ],
    available: [
      {
        menuItemId: availableMenuItemId,
        name: "Americano",
        category: "Coffee",
        defaultPrice: 4,
        currency: "USD"
      }
    ]
  }
}));

const inventoryCountSessionFixture = vi.hoisted(() => ({
  id: inventoryCountId,
  name: "AM Count",
  status: "in_progress" as const,
  locationId: primaryLocationId,
  locationName: "Primary Location",
  scheduledAt: null,
  startedAt: new Date().toISOString(),
  completedAt: null,
  updatedAt: new Date().toISOString(),
  notes: null,
  totalItems: 1,
  totalVariance: 0,
  attachmentsCount: 0
}));

const inventoryCountAttachmentFixture = vi.hoisted(() => ({
  id: "attach-1",
  countId: inventoryCountId,
  url: "https://files.example.com/photo.jpg",
  label: "Shelf photos",
  createdAt: new Date().toISOString(),
  createdByName: "Avery Jensen"
}));

const inventoryCountDetailFixture = vi.hoisted(() => ({
  session: inventoryCountSessionFixture,
  entries: [
    {
      itemId: assignedInventoryId,
      itemName: "Beans",
      sku: "BEANS-1",
      unit: "lb",
      systemQuantity: 10,
      countedQuantity: 11,
      variance: 1,
      notes: null
    }
  ],
  attachments: [inventoryCountAttachmentFixture]
}));

const dataMocks = vi.hoisted(() => ({
  getDashboardData: vi.fn().mockResolvedValue(dashboardFixture),
  getMenuItemsData: vi.fn().mockResolvedValue(menuFixture),
  getMenuModifiersData: vi.fn().mockResolvedValue([
    { id: "77777777-7777-7777-7777-777777777777", name: "Extra Shot", priceDelta: 1.5, maxSelect: 2 },
    { id: "88888888-8888-8888-8888-888888888888", name: "Oat Milk", priceDelta: 0.75, maxSelect: null }
  ]),
  getMenuItemModifierAssignments: vi.fn().mockResolvedValue({
    [assignedMenuItemId]: ["77777777-7777-7777-7777-777777777777"]
  }),
  createMenuModifier: vi.fn().mockResolvedValue({
    id: "99999999-9999-9999-9999-999999999999",
    name: "Whipped Cream",
    priceDelta: 0.5,
    maxSelect: 1
  }),
  getInventoryData: vi.fn().mockResolvedValue(inventoryFixture),
  getInventoryCounts: vi.fn().mockResolvedValue([inventoryCountSessionFixture]),
  getInventoryCountDetail: vi.fn().mockResolvedValue(inventoryCountDetailFixture),
  getInventoryCountSessionSummary: vi.fn().mockResolvedValue(inventoryCountSessionFixture),
  createInventoryCountAttachment: vi.fn().mockResolvedValue(inventoryCountAttachmentFixture),
  formatInventoryCountCsv: vi.fn().mockReturnValue("item_id,item_name\n123,Beans"),
  getTicketFeedData: vi.fn().mockResolvedValue(ticketsFixture),
  getPaymentsData: vi.fn().mockResolvedValue(paymentsFixture),
  getReportingData: vi.fn().mockResolvedValue(reportingFixture),
  getLoyaltyOverview: vi.fn().mockResolvedValue(loyaltyOverviewFixture),
  getLoyaltyAccountDetail: vi.fn().mockResolvedValue(loyaltyAccountDetailFixture),
  earnLoyaltyPoints: vi.fn().mockResolvedValue(loyaltyAccountDetailFixture),
  redeemLoyaltyPoints: vi.fn().mockResolvedValue(loyaltyAccountDetailFixture),
  getPortalContext: vi.fn().mockResolvedValue(contextFixture),
  getTenantLocations: vi.fn().mockResolvedValue(locationsFixture),
  createTenantLocation: vi.fn().mockResolvedValue(createdLocationFixture),
  updateTenantLocation: vi.fn().mockResolvedValue({
    ...locationsFixture[0],
    status: "inactive",
    managed: true,
    isPrimary: false
  }),
  getLocationAssignmentSummary: vi.fn().mockResolvedValue(locationAssignmentFixture),
  mutateLocationAssignments: vi.fn().mockResolvedValue(undefined),
  updateMenuItemStatus: vi.fn().mockResolvedValue(undefined),
  updateMenuItemDetails: vi.fn().mockResolvedValue({
    itemId: assignedMenuItemId,
    price: 12.5,
    currency: "USD"
  }),
  createMenuItem: vi.fn().mockResolvedValue({
    itemId: "menu-new",
    name: "Iced Latte",
    price: 750,
    currency: "USD",
    taxRate: 8.5,
    locationId: primaryLocationId
  }),
  updateMenuItemModifiers: vi.fn().mockResolvedValue({
    itemId: assignedMenuItemId,
    modifierIds: ["77777777-7777-7777-7777-777777777777", "88888888-8888-8888-8888-888888888888"]
  }),
  createPosTicket: vi.fn().mockResolvedValue({
    ticketId: "ticket-new",
    paymentId: "payment-new",
    locationId: primaryLocationId,
    subtotal: 1200,
    taxAmount: 100,
    total: 1300,
    tipAmount: 0,
    paymentMethod: "Card"
  }),
  getPaymentLocation: vi.fn().mockResolvedValue(primaryLocationId),
  createPaymentRefund: vi.fn().mockResolvedValue({
    refundId: "refund-new",
    paymentId: "payment-new",
    amount: 500,
    remainingAmount: 800,
    status: "completed",
    reason: "Customer request"
  }),
  updatePosPaymentStatus: vi.fn().mockResolvedValue(undefined),
  createInventoryAdjustment: vi.fn().mockResolvedValue({
    itemId: assignedInventoryId,
    locationId: primaryLocationId,
    previousQuantity: 10,
    newQuantity: 12
  }),
  createInventoryCountSession: vi.fn().mockResolvedValue(inventoryCountSessionFixture),
  recordInventoryCountEntries: vi.fn().mockResolvedValue(inventoryCountSessionFixture),
  completeInventoryCountSession: vi.fn().mockResolvedValue(inventoryCountDetailFixture),
  getUserLocationAccess: vi.fn().mockResolvedValue({
    isScoped: false,
    allowedLocationIds: [],
    manageableLocationIds: []
  }),
  getAccountProfile: vi.fn().mockResolvedValue({
    firstName: "Avery",
    lastName: "Jensen",
    title: "Founder",
    email: "avery@example.com",
    bio: "Bio"
  }),
  updateAccountProfile: vi.fn().mockResolvedValue({
    firstName: "Avery",
    lastName: "Jensen",
    title: "GM",
    email: "avery@example.com",
    bio: "Updated"
  }),
  getBusinessProfile: vi.fn().mockResolvedValue({
    legalName: "Nova Demo Co",
    doingBusinessAs: "Nova Demo Co",
    supportEmail: "support@example.com",
    supportPhone: null,
    website: null,
    timezone: "UTC",
    notes: "Notes"
  }),
  updateBusinessProfile: vi.fn().mockResolvedValue({
    legalName: "Nova Demo",
    doingBusinessAs: "Nova Demo",
    supportEmail: "help@example.com",
    supportPhone: null,
    website: null,
    timezone: "UTC",
    notes: "Updated"
  }),
  getInventoryAuditLog: vi.fn().mockResolvedValue([
    {
      id: "audit-1",
      itemId: "inv-1",
      itemName: "Beans",
      unit: "lb",
      delta: 2,
      reason: "Count",
      previousQuantity: 10,
      newQuantity: 12,
      notes: null,
      reference: null,
      createdAtIso: new Date().toISOString(),
      user: "Avery Jensen",
      locationName: "Primary Location"
    }
  ])
}));

vi.mock("../data.js", () => dataMocks);

let registerPortalRoutes: (app: FastifyInstance) => Promise<void>;

beforeAll(async () => {
  ({ registerPortalRoutes } = await import("../routes/index.js"));
});

afterAll(() => {
  vi.resetModules();
});

const mockUser = {
  id: "user-1",
  tenantId: "tenant-1",
  roles: ["owner"],
  permissions: [
    "pos.tickets.read",
    "inventory.locations.read",
    "inventory.locations.manage_assignments",
    "menu.items.update",
    "inventory.movements.create"
  ]
};

const createApp = async () => {
  const app = Fastify({ logger: { level: "silent" } });
  app.decorateRequest("user", null);
  app.addHook("onRequest", (request, _reply, done) => {
    request.user = mockUser;
    done();
  });
  await registerPortalRoutes(app);
  return app;
};

describe("portal routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    for (const mockFn of Object.values(dataMocks)) {
      mockFn.mockClear();
    }
    mockUser.permissions = [
      "pos.tickets.read",
      "pos.tickets.create",
      "inventory.locations.read",
      "inventory.locations.manage_assignments",
      "inventory.movements.read",
      "menu.items.create",
      "menu.items.update",
      "inventory.movements.create",
      "pos.payments.refund",
      "inventory.counts.read",
      "inventory.counts.create",
      "loyalty.accounts.read",
      "loyalty.transactions.read",
      "loyalty.transactions.earn",
      "loyalty.transactions.redeem"
    ];
    dataMocks.getUserLocationAccess.mockResolvedValue({
      isScoped: false,
      allowedLocationIds: [],
      manageableLocationIds: []
    });
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns account profile", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/account/profile"
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getAccountProfile).toHaveBeenCalledWith("tenant-1", "user-1");
  });

  it("updates account profile", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/portal/account/profile",
      payload: {
        firstName: "Avery",
        lastName: "Jensen",
        title: "GM",
        email: "avery@example.com",
        bio: "Updated bio"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.updateAccountProfile).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      expect.objectContaining({ firstName: "Avery", email: "avery@example.com" })
    );
  });

  it("returns business profile", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/account/business"
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getBusinessProfile).toHaveBeenCalledWith("tenant-1");
  });

  it("updates business profile", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/portal/account/business",
      payload: {
        legalName: "Nova Demo Co",
        supportEmail: "help@example.com",
        timezone: "UTC",
        notes: "Updated"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.updateBusinessProfile).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ legalName: "Nova Demo Co", supportEmail: "help@example.com" })
    );
  });

  it("returns dashboard data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/dashboard"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data.metrics.length).toBeGreaterThan(0);
  });

  it("returns menu data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/menu/items"
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().data)).toBe(true);
  });

  it("returns menu modifiers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/menu/modifiers"
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getMenuModifiersData).toHaveBeenCalled();
  });

  it("creates menu modifiers", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/menu/modifiers",
      payload: { name: "Whipped Cream", priceDelta: 0.5 }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.createMenuModifier).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ name: "Whipped Cream", priceDelta: 0.5 })
    );
  });

  it("returns modifier assignments", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/menu/modifiers/assignments"
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getMenuItemModifierAssignments).toHaveBeenCalled();
  });

  it("creates menu items", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/menu/items",
      payload: {
        name: "Iced Latte",
        categoryName: "Coffee",
        price: 6.5,
        taxRate: 8.5,
        currency: "usd",
        locationId: primaryLocationId
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.createMenuItem).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        name: "Iced Latte",
        categoryName: "Coffee",
        price: 6.5,
        taxRate: 8.5,
        currency: "USD",
        locationId: primaryLocationId
      })
    );
  });

  it("updates menu item modifiers", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/portal/menu/items/${assignedMenuItemId}/modifiers`,
      payload: {
        modifierIds: [
          "77777777-7777-7777-7777-777777777777",
          "88888888-8888-8888-8888-888888888888"
        ]
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.updateMenuItemModifiers).toHaveBeenCalledWith(
      "tenant-1",
      assignedMenuItemId,
      ["77777777-7777-7777-7777-777777777777", "88888888-8888-8888-8888-888888888888"]
    );
  });

  it("requires permission for modifier updates", async () => {
    mockUser.permissions = ["menu.items.create"];
    const response = await app.inject({
      method: "POST",
      url: `/portal/menu/items/${assignedMenuItemId}/modifiers`,
      payload: { modifierIds: [] }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.updateMenuItemModifiers).not.toHaveBeenCalled();
  });

  it("requires menu create permission", async () => {
    mockUser.permissions = ["menu.items.update"];
    const response = await app.inject({
      method: "POST",
      url: "/portal/menu/items",
      payload: { name: "Test", price: 5.5 }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createMenuItem).not.toHaveBeenCalled();
  });

  it("enforces location scope for menu creation", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "POST",
      url: "/portal/menu/items",
      payload: { name: "Scoped Item", price: 5.5, locationId: primaryLocationId }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createMenuItem).not.toHaveBeenCalled();
  });

  it("updates menu item status", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/portal/menu/items/${assignedMenuItemId}/status`,
      payload: { status: "inactive" }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.updateMenuItemStatus).toHaveBeenCalledWith(
      "tenant-1",
      assignedMenuItemId,
      "inactive"
    );
  });

  it("returns 404 when menu item is missing", async () => {
    dataMocks.updateMenuItemStatus.mockRejectedValueOnce(Errors.notFound("not found"));
    const response = await app.inject({
      method: "PATCH",
      url: `/portal/menu/items/${assignedMenuItemId}/status`,
      payload: { status: "inactive" }
    });
    expect(response.statusCode).toBe(404);
  });

  it("updates menu item details", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/portal/menu/items/${assignedMenuItemId}`,
      payload: { name: "Iced Latte", price: 7.5, currency: "usd" }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.updateMenuItemDetails).toHaveBeenCalledWith(
      "tenant-1",
      assignedMenuItemId,
      expect.objectContaining({ name: "Iced Latte", price: 7.5, currency: "USD" })
    );
  });

  it("requires menu permission to edit items", async () => {
    mockUser.permissions = ["pos.tickets.read"];
    const response = await app.inject({
      method: "PATCH",
      url: `/portal/menu/items/${assignedMenuItemId}`,
      payload: { description: "New desc" }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.updateMenuItemDetails).not.toHaveBeenCalled();
  });

  it("enforces location scope for menu edits", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/portal/menu/items/${assignedMenuItemId}`,
      payload: { price: 9.5, currency: "USD", locationId: primaryLocationId }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.updateMenuItemDetails).not.toHaveBeenCalled();
  });

  it("creates an inventory adjustment", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/items/${assignedInventoryId}/adjustments`,
      payload: { quantityDelta: 2, reason: "Cycle count", locationId: primaryLocationId }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.createInventoryAdjustment).toHaveBeenCalledWith(
      "tenant-1",
      assignedInventoryId,
      expect.objectContaining({
        quantityDelta: 2,
        reason: "Cycle count",
        locationId: primaryLocationId,
        userId: "user-1"
      })
    );
  });

  it("requires inventory movement permission", async () => {
    mockUser.permissions = ["pos.tickets.read"];
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/items/${assignedInventoryId}/adjustments`,
      payload: { quantityDelta: 1, reason: "Count" }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createInventoryAdjustment).not.toHaveBeenCalled();
  });

  it("enforces location manage scope for adjustments", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/items/${assignedInventoryId}/adjustments`,
      payload: { quantityDelta: 1, reason: "Count", locationId: managedLocationId }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createInventoryAdjustment).not.toHaveBeenCalled();
  });

  it("returns inventory data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/inventory/items"
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().data)).toBe(true);
  });

  it("returns inventory audit log entries", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/inventory/audit",
      query: { limit: "5" }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getInventoryAuditLog).toHaveBeenCalledWith("tenant-1", expect.any(Object), 5);
  });

  it("requires audit read permission", async () => {
    mockUser.permissions = mockUser.permissions.filter((perm) => perm !== "inventory.movements.read");
    const response = await app.inject({
      method: "GET",
      url: "/portal/inventory/audit"
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.getInventoryAuditLog).not.toHaveBeenCalled();
  });

  it("lists inventory count sessions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/inventory/counts",
      query: { limit: "3" }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getInventoryCounts).toHaveBeenCalledWith("tenant-1", 3);
  });

  it("returns inventory count detail", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/portal/inventory/counts/${inventoryCountId}`
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getInventoryCountDetail).toHaveBeenCalledWith("tenant-1", inventoryCountId);
  });

  it("creates an inventory count attachment", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/counts/${inventoryCountId}/attachments`,
      payload: { url: "https://files.example.com/photo.jpg", label: "Shelf photos" }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.createInventoryCountAttachment).toHaveBeenCalledWith(
      "tenant-1",
      inventoryCountId,
      "user-1",
      expect.objectContaining({ url: "https://files.example.com/photo.jpg", label: "Shelf photos" })
    );
  });

  it("requires counts.create permission for attachments", async () => {
    mockUser.permissions = mockUser.permissions.filter((perm) => perm !== "inventory.counts.create");
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/counts/${inventoryCountId}/attachments`,
      payload: { url: "https://files.example.com/photo.jpg" }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createInventoryCountAttachment).not.toHaveBeenCalled();
  });

  it("enforces location scope for attachments", async () => {
    dataMocks.getInventoryCountSessionSummary.mockResolvedValueOnce({
      ...inventoryCountSessionFixture,
      locationId: managedLocationId
    });
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/counts/${inventoryCountId}/attachments`,
      payload: { url: "https://files.example.com/photo.jpg" }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createInventoryCountAttachment).not.toHaveBeenCalled();
  });

  it("exports inventory count detail as CSV", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/portal/inventory/counts/${inventoryCountId}/export`
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("inventory-count");
    expect(dataMocks.getInventoryCountDetail).toHaveBeenCalledWith("tenant-1", inventoryCountId);
    expect(response.body).toContain("item_id,item_name");
  });

  it("creates an inventory count session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/inventory/counts",
      payload: { name: "AM Count", locationId: primaryLocationId }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.createInventoryCountSession).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      expect.objectContaining({ name: "AM Count", locationId: primaryLocationId })
    );
  });

  it("records inventory count entries", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/counts/${inventoryCountId}/items`,
      payload: {
        entries: [{ itemId: assignedInventoryId, countedQuantity: 11 }]
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.recordInventoryCountEntries).toHaveBeenCalledWith(
      "tenant-1",
      inventoryCountId,
      "user-1",
      expect.objectContaining({
        entries: [{ itemId: assignedInventoryId, countedQuantity: 11 }]
      })
    );
  });

  it("enforces location scope for count entry mutations", async () => {
    dataMocks.getInventoryCountSessionSummary.mockResolvedValueOnce({
      ...inventoryCountSessionFixture,
      locationId: managedLocationId
    });
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/counts/${inventoryCountId}/items`,
      payload: {
        entries: [{ itemId: assignedInventoryId, countedQuantity: 11 }]
      }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.recordInventoryCountEntries).not.toHaveBeenCalled();
  });

  it("completes an inventory count session", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/portal/inventory/counts/${inventoryCountId}/complete`
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.completeInventoryCountSession).toHaveBeenCalledWith(
      "tenant-1",
      inventoryCountId,
      "user-1"
    );
  });

  it("returns ticket feed", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/pos/tickets"
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().data)).toBe(true);
  });

  it("creates a POS ticket when authorized", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/tickets",
      payload: {
        items: [{ menuItemId: assignedMenuItemId, quantity: 2 }],
        paymentMethod: "Card",
        tipAmount: 1.5,
        locationId: primaryLocationId,
        notes: "Register sale"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.createPosTicket).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      expect.objectContaining({
        items: [{ menuItemId: assignedMenuItemId, quantity: 2 }],
        paymentMethod: "Card",
        tipAmount: 1.5,
        locationId: primaryLocationId,
        notes: "Register sale"
      })
    );
  });

  it("passes loyalty customer ids to ticket creation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/tickets",
      payload: {
        items: [{ menuItemId: assignedMenuItemId, quantity: 1 }],
        paymentMethod: "Card",
        locationId: primaryLocationId,
        loyaltyCustomerId: "avery@example.com"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.createPosTicket).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      expect.objectContaining({
        items: [{ menuItemId: assignedMenuItemId, quantity: 1 }],
        paymentMethod: "Card",
        loyaltyCustomerId: "avery@example.com"
      })
    );
  });

  it("requires pos ticket permission to create sales", async () => {
    mockUser.permissions = ["pos.tickets.read"];
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/tickets",
      payload: {
        items: [{ menuItemId: assignedMenuItemId, quantity: 1 }],
        paymentMethod: "Card"
      }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createPosTicket).not.toHaveBeenCalled();
  });

  it("enforces location scope for POS ticket creation", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/tickets",
      payload: {
        items: [{ menuItemId: assignedMenuItemId, quantity: 1 }],
        paymentMethod: "Card",
        locationId: primaryLocationId
      }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createPosTicket).not.toHaveBeenCalled();
  });

  it("creates a payment refund when authorized", async () => {
    const paymentId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const response = await app.inject({
      method: "POST",
      url: `/portal/pos/payments/${paymentId}/refunds`,
      payload: {
        amount: 5,
        reason: "Customer request"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getPaymentLocation).toHaveBeenCalledWith("tenant-1", paymentId);
    expect(dataMocks.createPaymentRefund).toHaveBeenCalledWith(
      "tenant-1",
      paymentId,
      "user-1",
      expect.objectContaining({ amount: 5, reason: "Customer request" })
    );
  });

  it("requires refund permission", async () => {
    mockUser.permissions = mockUser.permissions.filter(
      (permission) => permission !== "pos.payments.refund"
    );
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/payments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/refunds",
      payload: { amount: 4 }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.getPaymentLocation).not.toHaveBeenCalled();
    expect(dataMocks.createPaymentRefund).not.toHaveBeenCalled();
  });

  it("accepts provider status webhooks when secret matches", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/payments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/status",
      headers: {
        "x-payment-provider-secret": "sandbox-webhook-secret"
      },
      payload: {
        tenantId: "tenant-1",
        status: "completed",
        receiptUrl: "https://example.com/receipt/1",
        reference: "abc123",
        processorPaymentId: "proc-1"
      }
    });
    expect(response.statusCode).toBe(200);
    // The function should be called even if the payment doesn't exist
    expect(dataMocks.updatePosPaymentStatus).toHaveBeenCalledWith(
      "tenant-1",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      expect.objectContaining({
        status: "completed",
        receiptUrl: "https://example.com/receipt/1",
        reference: "abc123",
        processorPaymentId: "proc-1"
      })
    );
  });

  it("rejects provider status webhooks without valid secret", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/payments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/status",
      payload: { tenantId: "tenant-1", status: "failed" }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.updatePosPaymentStatus).not.toHaveBeenCalled();
  });

  it("enforces location scope for payment refunds", async () => {
    dataMocks.getPaymentLocation.mockResolvedValueOnce(managedLocationId);
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [primaryLocationId],
      manageableLocationIds: [primaryLocationId]
    });
    const response = await app.inject({
      method: "POST",
      url: "/portal/pos/payments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/refunds",
      payload: { amount: 4 }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.createPaymentRefund).not.toHaveBeenCalled();
  });


  it("returns payments data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/payments"
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data.summary).toBeDefined();
    expect(Array.isArray(payload.data.payments)).toBe(true);
    expect(payload.data.payments[0]).toEqual(
      expect.objectContaining({
        currency: "USD",
        amountValue: 32.4,
        tipAmountValue: 2.5,
        totalAmountValue: 34.9,
        refundedAmountValue: 5,
        remainingAmountValue: 29.9
      })
    );
  });

  it("returns loyalty overview data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/loyalty/overview?limit=10"
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getLoyaltyOverview).toHaveBeenCalledWith("tenant-1", { limit: 10 });
    const payload = response.json();
    expect(payload.data.accounts).toHaveLength(1);
  });

  it("requires loyalty overview permission", async () => {
    mockUser.permissions = mockUser.permissions.filter(
      (permission) => permission !== "loyalty.accounts.read"
    );
    const response = await app.inject({
      method: "GET",
      url: "/portal/loyalty/overview"
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.getLoyaltyOverview).not.toHaveBeenCalled();
  });

  it("returns loyalty account detail", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/portal/loyalty/accounts/${loyaltyAccountId}?limit=15`
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getLoyaltyAccountDetail).toHaveBeenCalledWith("tenant-1", loyaltyAccountId, 15);
  });

  it("earns loyalty points", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/loyalty/earn",
      payload: {
        externalCustomerId: "avery@example.com",
        points: 25,
        reference: "ticket-earn"
      }
    });
    expect(response.statusCode).toBe(201);
    expect(dataMocks.earnLoyaltyPoints).toHaveBeenCalledWith("tenant-1", "user-1", {
      externalCustomerId: "avery@example.com",
      points: 25,
      reference: "ticket-earn"
    });
  });

  it("redeems loyalty points", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/loyalty/redeem",
      payload: {
        accountId: loyaltyAccountId,
        points: 40,
        reference: "ticket-refund"
      }
    });
    expect(response.statusCode).toBe(201);
    expect(dataMocks.redeemLoyaltyPoints).toHaveBeenCalledWith("tenant-1", "user-1", {
      accountId: loyaltyAccountId,
      points: 40,
      reference: "ticket-refund"
    });
  });

  it("returns reporting data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/reporting"
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload.data.revenueSeries)).toBe(true);
    expect(Array.isArray(payload.data.ticketSeries)).toBe(true);
    expect(dataMocks.getReportingData).toHaveBeenCalledWith(
      "tenant-1",
      expect.anything(),
      expect.objectContaining({ windowDays: 7, category: undefined, locationId: undefined })
    );
  });

  it("blocks reporting location filters without access", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "GET",
      url: `/portal/reporting?locationId=${managedLocationId}`
    });
    expect(response.statusCode).toBe(403);
  });

  it("returns reporting data for scoped locations", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "GET",
      url: `/portal/reporting?locationId=${managedLocationId}`
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.getReportingData).toHaveBeenCalledWith(
      "tenant-1",
      expect.anything(),
      expect.objectContaining({ locationId: managedLocationId })
    );
  });

  it("exports reporting csv for scoped locations", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "GET",
      url: `/portal/reporting?export=csv&locationId=${managedLocationId}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain(managedLocationId);
  });

  it("returns portal context payload", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/context"
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data.tenant.id).toBe("tenant-1");
    expect(payload.data.tenant.planName).toBe("Core");
    expect(payload.data.tenant.subscriptionStatus).toBe("active");
    expect(payload.data.tenant.nextPayoutAt).toBe("2025-11-09T00:00:00.000Z");
    expect(payload.data.tenant.locationCount).toBe(2);
    expect(Array.isArray(payload.data.modules)).toBe(true);
    expect(dataMocks.getPortalContext).toHaveBeenCalledWith(
      "tenant-1",
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        permissions: expect.arrayContaining(["pos.tickets.read"]),
        roles: ["owner"]
      })
    );
  });

  it("returns tenant location summaries", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/portal/locations"
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data).toEqual(locationsFixture);
    expect(dataMocks.getTenantLocations).toHaveBeenCalledWith("tenant-1", expect.anything());
  });

  it("creates a tenant location", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portal/locations",
      payload: { name: "Roastery", code: "roastery", timezone: "America/Los_Angeles" }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toEqual(createdLocationFixture);
    expect(dataMocks.createTenantLocation).toHaveBeenCalledWith(
      "tenant-1",
      expect.anything(),
      expect.objectContaining({ name: "Roastery", code: "roastery", timezone: "America/Los_Angeles" })
    );
  });

  it("updates a tenant location", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/portal/locations/${primaryLocationId}`,
      payload: { status: "inactive" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("inactive");
    expect(dataMocks.updateTenantLocation).toHaveBeenCalledWith(
      "tenant-1",
      primaryLocationId,
      expect.anything(),
      expect.objectContaining({ status: "inactive" })
    );
  });

  it("returns location assignment summary", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/portal/locations/${primaryLocationId}/assignments`
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data).toEqual(locationAssignmentFixture);
    expect(dataMocks.getLocationAssignmentSummary).toHaveBeenCalledWith(
      "tenant-1",
      primaryLocationId,
      expect.anything()
    );
  });

  it("requires location assignment permission to read workspace", async () => {
    mockUser.permissions = ["pos.tickets.read"];
    const response = await app.inject({
      method: "GET",
      url: `/portal/locations/${managedLocationId}/assignments`
    });
    expect(response.statusCode).toBe(403);
  });

  it("prevents scoped users from accessing unmanaged locations", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: ["33333333-0000-0000-0000-000000000000"],
      manageableLocationIds: ["33333333-0000-0000-0000-000000000000"]
    });
    const response = await app.inject({
      method: "GET",
      url: `/portal/locations/${managedLocationId}/assignments`
    });
    expect(response.statusCode).toBe(403);
  });

  it("requires scoped manage access for mutations", async () => {
    dataMocks.getUserLocationAccess.mockResolvedValueOnce({
      isScoped: true,
      allowedLocationIds: [managedLocationId],
      manageableLocationIds: []
    });
    const response = await app.inject({
      method: "POST",
      url: `/portal/locations/${managedLocationId}/assignments`,
      payload: { assignInventory: [availableInventoryId] }
    });
    expect(response.statusCode).toBe(403);
    expect(dataMocks.mutateLocationAssignments).not.toHaveBeenCalled();
  });

  it("mutates location assignments", async () => {
    const mutation = {
      assignInventory: [availableInventoryId],
      removeMenuItems: [assignedMenuItemId]
    };
    const response = await app.inject({
      method: "POST",
      url: `/portal/locations/${managedLocationId}/assignments`,
      payload: mutation
    });
    expect(response.statusCode).toBe(200);
    expect(dataMocks.mutateLocationAssignments).toHaveBeenCalledWith(
      "tenant-1",
      managedLocationId,
      expect.anything(),
      expect.objectContaining({
        assignInventory: [availableInventoryId],
        removeMenuItems: [assignedMenuItemId],
        assignMenuItems: [],
        removeInventory: []
      })
    );
    expect(dataMocks.getLocationAssignmentSummary).toHaveBeenCalledWith(
      "tenant-1",
      managedLocationId,
      expect.anything()
    );
    const payload = response.json();
    expect(payload.data).toEqual(locationAssignmentFixture);
  });

  it("requires authentication", async () => {
    const unauthApp = Fastify({ logger: { level: "silent" } });
    unauthApp.decorateRequest("user", null);
    await registerPortalRoutes(unauthApp);
    const response = await unauthApp.inject({
      method: "GET",
      url: "/portal/dashboard"
    });
    expect(response.statusCode).toBe(401);
  });
});
