import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors } from "../../../errors.js";
import { env } from "../../../config.js";
import type { AuthenticatedUser } from "../../../plugins/auth.js";
import { requirePermissions } from "../../../plugins/authorize.js";
import {
  getDashboardData,
  getInventoryData,
  getInventoryAuditLog,
  getInventoryCountDetail,
  getInventoryCountSessionSummary,
  getInventoryCounts,
  getMenuItemsData,
  getMenuModifiersData,
  getMenuItemModifierAssignments,
  getTicketFeedData,
  getPaymentsData,
  getReportingData,
  getPortalContext,
  getTenantLocations,
  createTenantLocation,
  updateTenantLocation,
  getLocationAssignmentSummary,
  mutateLocationAssignments,
  updateMenuItemStatus,
  updateMenuItemDetails,
  updateMenuItemModifiers,
  createMenuItem,
  createMenuModifier,
  getUserLocationAccess,
  createInventoryAdjustment,
  createInventoryCountSession,
  recordInventoryCountEntries,
  completeInventoryCountSession,
  createInventoryCountAttachment,
  formatInventoryCountCsv,
  createPosTicket,
  PRIMARY_LOCATION_ID,
  getAccountProfile,
  updateAccountProfile,
  getBusinessProfile,
  updateBusinessProfile,
  getPaymentLocation,
  createPaymentRefund,
  updatePosPaymentStatus,
  getLoyaltyOverview,
  getLoyaltyAccountDetail,
  earnLoyaltyPoints,
  redeemLoyaltyPoints
} from "../data.js";

const requireUser = (request: FastifyRequest) => {
  if (!request.user) throw Errors.authn();
  return request.user;
};

const requireTenant = (request: FastifyRequest) => requireUser(request).tenantId;

const replyCSV = (reply: FastifyReply, filename: string, body: string) =>
  reply
    .header("content-type", "text/csv")
    .header("content-disposition", `attachment; filename="${filename}"`)
    .send(body);

const locationCodeRegex = /^[a-z0-9-]+$/i;

const buildFilenameSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "inventory-count";

const createLocationSchema = z.object({
  name: z.string().trim().min(2).max(64),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(locationCodeRegex, "Code must be alphanumeric or hyphen characters"),
  timezone: z.string().trim().min(2).max(64).default("UTC")
});

const updateLocationSchema = z
  .object({
    name: z.string().trim().min(2).max(64).optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .refine((value) => Boolean(value.name || value.timezone || value.status), {
    message: "Provide at least one field to update"
  });

const locationParamsSchema = z.object({
  locationId: z.string().uuid()
});

const assignmentMutationSchema = z
  .object({
    assignInventory: z.array(z.string().uuid()).default([]),
    removeInventory: z.array(z.string().uuid()).default([]),
    assignMenuItems: z.array(z.string().uuid()).default([]),
    removeMenuItems: z.array(z.string().uuid()).default([])
  })
  .refine(
    (value) =>
      value.assignInventory.length > 0 ||
      value.removeInventory.length > 0 ||
      value.assignMenuItems.length > 0 ||
      value.removeMenuItems.length > 0,
    { message: "Provide at least one assignment change" }
  );

const menuItemParamsSchema = z.object({
  itemId: z.string().uuid()
});

const inventoryItemParamsSchema = z.object({
  itemId: z.string().uuid()
});

const paymentParamsSchema = z.object({
  paymentId: z.string().uuid()
});

const menuStatusSchema = z.object({
  status: z.enum(["active", "inactive"])
});

const inventoryAdjustmentSchema = z
  .object({
    quantityDelta: z.coerce.number(),
    reason: z.string().trim().min(3).max(120),
    notes: z.string().trim().max(256).optional(),
    reference: z.string().trim().max(64).optional(),
    locationId: z.string().uuid().optional()
  })
  .refine((value) => Number.isFinite(value.quantityDelta) && value.quantityDelta !== 0, {
    message: "quantityDelta must be a non-zero number",
    path: ["quantityDelta"]
  });

const inventoryCountListQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10)
});

const createInventoryCountSchema = z.object({
  name: z.string().trim().min(3).max(120),
  locationId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().trim().max(512).optional()
});

const inventoryCountEntriesSchema = z.object({
  entries: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        countedQuantity: z.coerce.number().min(0),
        notes: z.string().trim().max(256).optional()
      })
    )
    .min(1, "Provide at least one counted item")
});

const inventoryCountParamsSchema = z.object({
  countId: z.string().uuid()
});

const countAttachmentSchema = z.object({
  url: z.string().trim().url().max(2048),
  label: z
    .string()
    .trim()
    .max(120)
    .optional()
});

const ticketItemInputSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(500)
});

const createTicketSchema = z.object({
  items: z.array(ticketItemInputSchema).min(1).max(25),
  paymentMethod: z.enum(["Card", "Cash", "Online"]).default("Card"),
  tipAmount: z.coerce.number().min(0).max(1000).optional(),
  locationId: z.string().uuid().optional(),
  notes: z.string().trim().max(256).optional(),
  paymentReference: z.string().trim().max(64).optional(),
  paymentProcessor: z.string().trim().max(64).optional(),
  paymentProcessorPaymentId: z.string().trim().max(96).optional(),
  paymentMethodType: z.string().trim().max(32).optional(),
  paymentMethodBrand: z.string().trim().max(32).optional(),
  paymentMethodLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Expected last4 digits")
    .optional(),
  receiptUrl: z.string().trim().url().max(512).optional(),
  metadata: z.record(z.any()).optional(),
  loyaltyCustomerId: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .optional()
});

const paymentRefundSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  reason: z.string().trim().max(256).optional()
});

const paymentStatusSchema = z.object({
  tenantId: z.string().trim().min(1),
  status: z.enum(["completed", "pending", "failed", "refunded"]),
  failureReason: z.string().trim().max(256).nullable().optional(),
  receiptUrl: z.string().trim().url().max(512).nullable().optional(),
  reference: z.string().trim().max(64).nullable().optional(),
  processorPaymentId: z.string().trim().max(96).nullable().optional()
});

const loyaltyOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

const loyaltyTransactionsParamsSchema = z.object({
  accountId: z.string().uuid()
});

const loyaltyTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

const loyaltyEarnSchema = z
  .object({
    externalCustomerId: z.string().trim().min(1).max(160),
    points: z.coerce.number().int().min(1).optional(),
    amount: z.coerce.number().nonnegative().optional(),
    reference: z.string().trim().max(120).optional(),
    source: z.string().trim().max(64).optional(),
    metadata: z.record(z.any()).optional()
  })
  .refine((value) => value.points !== undefined || value.amount !== undefined, {
    message: "Provide either points or amount"
  });

const loyaltyRedeemSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    externalCustomerId: z.string().trim().max(160).optional(),
    points: z.coerce.number().int().min(1),
    reference: z.string().trim().max(120).optional(),
    source: z.string().trim().max(64).optional(),
    metadata: z.record(z.any()).optional()
  })
  .refine((value) => Boolean(value.accountId || value.externalCustomerId), {
    message: "Provide accountId or externalCustomerId"
  });

const menuItemUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(256).optional(),
    taxRate: z.coerce.number().min(0).max(50).optional(),
    price: z.coerce.number().min(0.01).max(100000).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
    locationId: z.string().uuid().optional()
  })
  .refine(
    (value) =>
      Boolean(value.name) ||
      value.description !== undefined ||
      value.taxRate !== undefined ||
      value.price !== undefined ||
      value.currency !== undefined,
    { message: "Provide at least one field to update" }
  );

const menuItemModifierSchema = z.object({
  modifierIds: z.array(z.string().uuid()).default([])
});

const createMenuItemSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(256).optional(),
  categoryName: z.string().trim().min(2).max(64).optional(),
  taxRate: z.coerce.number().min(0).max(50).default(0),
  price: z.coerce.number().min(0.01).max(100000),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  locationId: z.string().uuid().optional()
});

const createModifierSchema = z.object({
  name: z.string().trim().min(2).max(80),
  priceDelta: z.coerce.number().min(-1000).max(1000).default(0),
  maxSelect: z
    .union([z.coerce.number().int().min(0), z.literal(null), z.literal(undefined)])
    .optional()
});

const accountProfileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  title: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email(),
  bio: z.string().trim().max(512).optional().nullable()
});

const businessProfileUpdateSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  doingBusinessAs: z.string().trim().min(2).max(160).optional().nullable(),
  supportEmail: z.string().trim().email().optional().nullable(),
  supportPhone: z.string().trim().max(64).optional().nullable(),
  website: z.string().trim().url().optional().nullable(),
  timezone: z.string().trim().min(2).max(64),
  notes: z.string().trim().max(512).optional().nullable()
});

const inventoryAuditQuerySchema = z.object({
  limit: z
    .union([z.coerce.number().int().min(1).max(100), z.undefined()])
    .transform((value) => value ?? 20)
});

const handleLocationMutationError = (error: unknown) => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      throw Errors.conflict("Location code already exists");
    }
  }
  throw error;
};

const ensureLocationAssignmentScope = async (
  user: AuthenticatedUser,
  locationId?: string,
  options: { requireManage?: boolean } = {}
) => {
  const targetLocationId = locationId ?? PRIMARY_LOCATION_ID;
  const access = await getUserLocationAccess(user.tenantId, user.id);
  if (access.isScoped && !access.allowedLocationIds.includes(targetLocationId)) {
    throw Errors.authz();
  }
  if (options.requireManage) {
    const canManage =
      !access.isScoped || access.manageableLocationIds.includes(targetLocationId);
    if (!canManage) {
      throw Errors.authz();
    }
  }
};

export const registerPortalRoutes = async (app: FastifyInstance) => {
  app.get("/portal/context", async (request) => {
    const user = requireUser(request);
    const data = await getPortalContext(user.tenantId, request.log, {
      userId: user.id,
      permissions: user.permissions,
      roles: user.roles
    });
    return { data };
  });

  app.get("/portal/account/profile", async (request) => {
    const user = requireUser(request);
    const profile = await getAccountProfile(user.tenantId, user.id);
    return { data: profile };
  });

  app.patch("/portal/account/profile", async (request) => {
    const user = requireUser(request);
    const payload = accountProfileUpdateSchema.parse(request.body ?? {});
    const profile = await updateAccountProfile(user.tenantId, user.id, payload);
    return { data: profile };
  });

  app.get("/portal/account/business", async (request) => {
    const tenantId = requireTenant(request);
    const profile = await getBusinessProfile(tenantId);
    return { data: profile };
  });

  app.patch("/portal/account/business", async (request) => {
    const tenantId = requireTenant(request);
    const payload = businessProfileUpdateSchema.parse(request.body ?? {});
    const profile = await updateBusinessProfile(tenantId, payload);
    return { data: profile };
  });

  app.get("/portal/locations", async (request) => {
    const tenantId = requireTenant(request);
    const data = await getTenantLocations(tenantId, request.log);
    return { data };
  });

  app.post("/portal/locations", async (request, reply) => {
    const tenantId = requireTenant(request);
    const payload = createLocationSchema.parse(request.body ?? {});
    try {
      const data = await createTenantLocation(tenantId, request.log, payload);
      return reply.code(201).send({ data });
    } catch (error) {
      handleLocationMutationError(error);
    }
  });

  app.patch("/portal/locations/:locationId", async (request) => {
    const tenantId = requireTenant(request);
    const { locationId } = locationParamsSchema.parse(request.params);
    const payload = updateLocationSchema.parse(request.body ?? {});
    try {
      const updated = await updateTenantLocation(tenantId, locationId, request.log, payload);
      if (!updated) {
        throw Errors.notFound("Location not found");
      }
      return { data: updated };
    } catch (error) {
      handleLocationMutationError(error);
    }
  });

  app.get(
    "/portal/locations/:locationId/assignments",
    { preHandler: requirePermissions("inventory.locations.read") },
    async (request) => {
      const user = requireUser(request);
      const tenantId = user.tenantId;
      const { locationId } = locationParamsSchema.parse(request.params);
      await ensureLocationAssignmentScope(user, locationId);
      const data = await getLocationAssignmentSummary(tenantId, locationId, request.log);
      return { data };
    }
  );

  app.post(
    "/portal/locations/:locationId/assignments",
    { preHandler: requirePermissions("inventory.locations.manage_assignments") },
    async (request) => {
      const user = requireUser(request);
      const tenantId = user.tenantId;
      const { locationId } = locationParamsSchema.parse(request.params);
      await ensureLocationAssignmentScope(user, locationId, { requireManage: true });
      const payload = assignmentMutationSchema.parse(request.body ?? {});
      await mutateLocationAssignments(tenantId, locationId, request.log, payload);
      const data = await getLocationAssignmentSummary(tenantId, locationId, request.log);
      return { data };
    }
  );

  app.get("/portal/dashboard", async (request) => {
    const tenantId = requireTenant(request);
    const data = await getDashboardData(tenantId, request.log);
    return { data };
  });

  app.get("/portal/menu/items", async (request) => {
    const tenantId = requireTenant(request);
    const data = await getMenuItemsData(tenantId, request.log);
    return { data };
  });

  app.get("/portal/menu/modifiers", async (request) => {
    const tenantId = requireTenant(request);
    const data = await getMenuModifiersData(tenantId, request.log);
    return { data };
  });

  app.post(
    "/portal/menu/modifiers",
    { preHandler: requirePermissions("menu.items.update") },
    async (request) => {
      const user = requireUser(request);
      const payload = createModifierSchema.parse(request.body ?? {});
      const data = await createMenuModifier(user.tenantId, payload);
      return { data };
    }
  );

  app.get("/portal/menu/modifiers/assignments", async (request) => {
    const tenantId = requireTenant(request);
    const data = await getMenuItemModifierAssignments(tenantId, request.log);
    return { data };
  });

  app.post(
    "/portal/menu/items",
    { preHandler: requirePermissions("menu.items.create") },
    async (request) => {
      const user = requireUser(request);
      const payload = createMenuItemSchema.parse(request.body ?? {});
      if (payload.locationId) {
        await ensureLocationAssignmentScope(user, payload.locationId, { requireManage: true });
      }
      const data = await createMenuItem(user.tenantId, payload);
      return { data };
    }
  );

  app.patch(
    "/portal/menu/items/:itemId/status",
    { preHandler: requirePermissions("menu.items.update") },
    async (request) => {
      const tenantId = requireTenant(request);
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const payload = menuStatusSchema.parse(request.body ?? {});
      await updateMenuItemStatus(tenantId, itemId, payload.status);
      return { data: { id: itemId, status: payload.status } };
    }
  );

  app.patch(
    "/portal/menu/items/:itemId",
    { preHandler: requirePermissions("menu.items.update") },
    async (request) => {
      const user = requireUser(request);
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const payload = menuItemUpdateSchema.parse(request.body ?? {});
      if (payload.locationId) {
        await ensureLocationAssignmentScope(user, payload.locationId, { requireManage: true });
      }
      const data = await updateMenuItemDetails(user.tenantId, itemId, payload);
      return { data };
    }
  );

  app.post(
    "/portal/menu/items/:itemId/modifiers",
    { preHandler: requirePermissions("menu.items.update") },
    async (request) => {
      const user = requireUser(request);
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const payload = menuItemModifierSchema.parse(request.body ?? {});
      const data = await updateMenuItemModifiers(user.tenantId, itemId, payload.modifierIds);
      return { data };
    }
  );

  app.get("/portal/inventory/items", async (request) => {
    const tenantId = requireTenant(request);
    const data = await getInventoryData(tenantId, request.log);
    return { data };
  });

  app.get(
    "/portal/inventory/audit",
    { preHandler: requirePermissions("inventory.movements.read") },
    async (request) => {
      const tenantId = requireTenant(request);
      const query = inventoryAuditQuerySchema.parse(request.query ?? {});
      const data = await getInventoryAuditLog(tenantId, request.log, query.limit);
      return { data };
    }
  );

  app.post(
    "/portal/inventory/items/:itemId/adjustments",
    { preHandler: requirePermissions("inventory.movements.create") },
    async (request) => {
      const user = requireUser(request);
      const { itemId } = inventoryItemParamsSchema.parse(request.params);
      const payload = inventoryAdjustmentSchema.parse(request.body ?? {});
      await ensureLocationAssignmentScope(user, payload.locationId, { requireManage: true });
      const result = await createInventoryAdjustment(user.tenantId, itemId, {
        ...payload,
        userId: user.id ?? null
      });
      return { data: result };
    }
  );

  app.get(
    "/portal/inventory/counts",
    { preHandler: requirePermissions("inventory.counts.read") },
    async (request) => {
      const tenantId = requireTenant(request);
      const query = inventoryCountListQuerySchema.parse(request.query ?? {});
      const data = await getInventoryCounts(tenantId, query.limit);
      return { data };
    }
  );

  app.get(
    "/portal/inventory/counts/:countId",
    { preHandler: requirePermissions("inventory.counts.read") },
    async (request) => {
      const tenantId = requireTenant(request);
      const { countId } = inventoryCountParamsSchema.parse(request.params);
      const data = await getInventoryCountDetail(tenantId, countId);
      return { data };
    }
  );

  app.get(
    "/portal/inventory/counts/:countId/export",
    { preHandler: requirePermissions("inventory.counts.read") },
    async (request, reply) => {
      const tenantId = requireTenant(request);
      const { countId } = inventoryCountParamsSchema.parse(request.params);
      const detail = await getInventoryCountDetail(tenantId, countId);
      const csv = formatInventoryCountCsv(detail);
      const slug = buildFilenameSlug(detail.session.name ?? "inventory-count");
      return replyCSV(reply, `inventory-count-${slug}-${countId}.csv`, csv);
    }
  );

  app.post(
    "/portal/inventory/counts",
    { preHandler: requirePermissions("inventory.counts.create") },
    async (request) => {
      const user = requireUser(request);
      const payload = createInventoryCountSchema.parse(request.body ?? {});
      const locationId = payload.locationId ?? PRIMARY_LOCATION_ID;
      await ensureLocationAssignmentScope(user, locationId, { requireManage: true });
      const data = await createInventoryCountSession(user.tenantId, user.id ?? null, payload);
      return { data };
    }
  );

  app.post(
    "/portal/inventory/counts/:countId/items",
    { preHandler: requirePermissions("inventory.counts.create") },
    async (request) => {
      const user = requireUser(request);
      const { countId } = inventoryCountParamsSchema.parse(request.params);
      const payload = inventoryCountEntriesSchema.parse(request.body ?? {});
      const session = await getInventoryCountSessionSummary(user.tenantId, countId);
      await ensureLocationAssignmentScope(user, session.locationId, { requireManage: true });
      const data = await recordInventoryCountEntries(user.tenantId, countId, user.id ?? null, payload);
      return { data };
    }
  );

  app.post(
    "/portal/inventory/counts/:countId/complete",
    { preHandler: requirePermissions("inventory.counts.create") },
    async (request) => {
      const user = requireUser(request);
      const { countId } = inventoryCountParamsSchema.parse(request.params);
      const session = await getInventoryCountSessionSummary(user.tenantId, countId);
      await ensureLocationAssignmentScope(user, session.locationId, { requireManage: true });
      const data = await completeInventoryCountSession(user.tenantId, countId, user.id ?? null);
      return { data };
    }
  );

  app.post(
    "/portal/inventory/counts/:countId/attachments",
    { preHandler: requirePermissions("inventory.counts.create") },
    async (request) => {
      const user = requireUser(request);
      const { countId } = inventoryCountParamsSchema.parse(request.params);
      const payload = countAttachmentSchema.parse(request.body ?? {});
      const session = await getInventoryCountSessionSummary(user.tenantId, countId);
      await ensureLocationAssignmentScope(user, session.locationId, { requireManage: true });
      const data = await createInventoryCountAttachment(
        user.tenantId,
        countId,
        user.id ?? null,
        payload
      );
      return { data };
    }
  );

  app.get("/portal/pos/tickets", async (request) => {
    const tenantId = requireTenant(request);
    const data = await getTicketFeedData(tenantId, request.log);
    return { data };
  });

  app.post(
    "/portal/pos/tickets",
    { preHandler: requirePermissions("pos.tickets.create") },
    async (request) => {
      const user = requireUser(request);
      const payload = createTicketSchema.parse(request.body ?? {});
      await ensureLocationAssignmentScope(user, payload.locationId);
      const data = await createPosTicket(user.tenantId, user.id ?? null, payload);
      return { data };
    }
  );

  const dateInputSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional();

  const paymentsQuerySchema = z
    .object({
      limit: z.coerce.number().min(5).max(50).default(15),
      method: z
        .string()
        .min(1)
        .max(32)
        .optional()
        .transform((value) => (value && value.toUpperCase() === "ALL" ? undefined : value)),
      startDate: dateInputSchema,
      endDate: dateInputSchema,
      export: z.enum(["none", "csv"]).default("none")
    })
    .refine(
      (value) => {
        if (!value.startDate || !value.endDate) return true;
        return value.startDate <= value.endDate;
      },
      { message: "endDate must be on or after startDate", path: ["endDate"] }
    );

  app.get("/portal/payments", async (request, reply) => {
    const tenantId = requireTenant(request);
    const query = paymentsQuerySchema.parse(request.query);
    const data = await getPaymentsData(tenantId, request.log, {
      limit: query.limit,
      method: query.method,
      startDate: query.startDate,
      endDate: query.endDate
    });

    if (query.export === "csv") {
      const rows = [
        "ticket_id,method,status,amount,tip,processed_at",
        ...data.payments.map((payment) =>
          [
            payment.ticketId,
            payment.method,
            payment.status,
            payment.amount,
            payment.tipAmount,
            payment.processedAt
          ]
            .map((value) => `"${value.replace(/"/g, '""')}"`)
            .join(",")
        )
      ].join("\n");
      return replyCSV(reply, "payments-export.csv", rows);
    }
    return { data };
  });

  app.post(
    "/portal/pos/payments/:paymentId/refunds",
    { preHandler: requirePermissions("pos.payments.refund") },
    async (request) => {
      const user = requireUser(request);
      const { paymentId } = paymentParamsSchema.parse(request.params);
      const payload = paymentRefundSchema.parse(request.body ?? {});
      const locationId = await getPaymentLocation(user.tenantId, paymentId);
      await ensureLocationAssignmentScope(user, locationId, { requireManage: true });
      const data = await createPaymentRefund(user.tenantId, paymentId, user.id ?? null, payload);
      return { data };
    }
  );

  app.post("/portal/pos/payments/:paymentId/status", async (request) => {
    const secret = request.headers["x-payment-provider-secret"];
    if (!secret || secret !== env.PAYMENT_PROVIDER_WEBHOOK_SECRET) {
      throw Errors.authz("Invalid provider secret");
    }
    const { paymentId } = paymentParamsSchema.parse(request.params);
    const payload = paymentStatusSchema.parse(request.body ?? {});
    try {
      await updatePosPaymentStatus(payload.tenantId, paymentId, {
        status: payload.status,
        failureReason: payload.failureReason ?? null,
        receiptUrl: payload.receiptUrl ?? null,
        reference: payload.reference ?? null,
        processorPaymentId: payload.processorPaymentId ?? null
      });
    } catch (error) {
      request.log.warn(
        { err: error, paymentId, tenantId: payload.tenantId },
        "payment.status_webhook.update_failed"
      );
      // Webhook responses should not leak internal errors to the provider
    }
    return { data: { paymentId, status: payload.status } };
  });

  app.get(
    "/portal/loyalty/overview",
    { preHandler: requirePermissions("loyalty.accounts.read") },
    async (request) => {
      const tenantId = requireTenant(request);
      const query = loyaltyOverviewQuerySchema.parse(request.query ?? {});
      const data = await getLoyaltyOverview(tenantId, { limit: query.limit });
      return { data };
    }
  );

  app.get(
    "/portal/loyalty/accounts/:accountId",
    { preHandler: requirePermissions("loyalty.transactions.read") },
    async (request) => {
      const tenantId = requireTenant(request);
      const { accountId } = loyaltyTransactionsParamsSchema.parse(request.params);
      const query = loyaltyTransactionsQuerySchema.parse(request.query ?? {});
      const data = await getLoyaltyAccountDetail(tenantId, accountId, query.limit);
      return { data };
    }
  );

  app.post(
    "/portal/loyalty/earn",
    { preHandler: requirePermissions("loyalty.transactions.earn") },
    async (request, reply) => {
      const user = requireUser(request);
      const payload = loyaltyEarnSchema.parse(request.body ?? {});
      const data = await earnLoyaltyPoints(user.tenantId, user.id ?? null, payload);
      return reply.code(201).send({ data });
    }
  );

  app.post(
    "/portal/loyalty/redeem",
    { preHandler: requirePermissions("loyalty.transactions.redeem") },
    async (request, reply) => {
      const user = requireUser(request);
      const payload = loyaltyRedeemSchema.parse(request.body ?? {});
      const data = await redeemLoyaltyPoints(user.tenantId, user.id ?? null, payload);
      return reply.code(201).send({ data });
    }
  );

  const reportingQuerySchema = z.object({
    windowDays: z.coerce.number().min(7).max(90).default(7),
    category: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional(),
    locationId: z.string().uuid().optional(),
    export: z.enum(["none", "csv"]).default("none")
  });

  app.get("/portal/reporting", async (request, reply) => {
    const user = requireUser(request);
    const tenantId = user.tenantId;
    const query = reportingQuerySchema.parse(request.query);
    let locationFilter: string | undefined;
    if (query.locationId) {
      await ensureLocationAssignmentScope(user, query.locationId);
      locationFilter = query.locationId;
    }
    const data = await getReportingData(tenantId, request.log, {
      windowDays: query.windowDays,
      category: query.category,
      locationId: locationFilter
    });

    if (query.export === "csv") {
      const rows = [
        "date,revenue,tickets",
        ...data.revenueSeries.map((series, index) => {
          const tickets = data.ticketSeries[index]?.count ?? "";
          return [series.date, series.total, tickets].join(",");
        })
      ].join("\n");
      const locationSuffix = locationFilter ? `-${locationFilter}` : "";
      return replyCSV(reply, `reporting-${query.windowDays}d${locationSuffix}.csv`, rows);
    }
    return { data };
  });
};
