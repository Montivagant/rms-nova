import { z } from "zod";

const subscriptionActivated = z.object({
  type: z.literal("subscription.activated"),
  data: z.object({
    subscriptionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    planId: z.string().uuid(),
    billingCycle: z.enum(["monthly", "quarterly", "annually"]),
    currentPeriodEnd: z.string().datetime()
  })
});

const subscriptionPastDue = z.object({
  type: z.literal("subscription.past_due"),
  data: z.object({
    subscriptionId: z.string().uuid()
  })
});

const subscriptionCanceled = z.object({
  type: z.literal("subscription.canceled"),
  data: z.object({
    subscriptionId: z.string().uuid(),
    cancelAtPeriodEnd: z.boolean().optional(),
    currentPeriodEnd: z.string().datetime().optional()
  })
});

const subscriptionPlanChanged = z.object({
  type: z.literal("subscription.plan_changed"),
  data: z.object({
    subscriptionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    planId: z.string().uuid(),
    billingCycle: z.enum(["monthly", "quarterly", "annually"])
  })
});

const invoiceCreated = z.object({
  type: z.literal("invoice.created"),
  data: z.object({
    invoiceId: z.string().uuid(),
    tenantId: z.string().uuid(),
    subscriptionId: z.string().uuid(),
    currency: z.string().default("USD"),
    totalDue: z.number().nonnegative(),
    dueAt: z.string().datetime().optional()
  })
});

const invoicePaymentSucceeded = z.object({
  type: z.literal("invoice.payment_succeeded"),
  data: z.object({
    invoiceId: z.string().uuid(),
    paidAmount: z.number().nonnegative().optional()
  })
});

const invoicePaymentFailed = z.object({
  type: z.literal("invoice.payment_failed"),
  data: z.object({
    invoiceId: z.string().uuid()
  })
});

export const billingWebhookEventSchema = z.discriminatedUnion("type", [
  subscriptionActivated,
  subscriptionPastDue,
  subscriptionCanceled,
  subscriptionPlanChanged,
  invoiceCreated,
  invoicePaymentSucceeded,
  invoicePaymentFailed
]);

export type BillingWebhookEvent = z.infer<typeof billingWebhookEventSchema>;

type Queryable = {
  query: <T = unknown>(
    queryText: string,
    params?: unknown[]
  ) => Promise<{
    rows: T[];
    rowCount: number;
  }>;
};

type AuditInput = {
  tenantId?: string | null;
  action: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  delta?: Record<string, unknown>;
};

export interface BillingWebhookLogger {
  warn: (details: Record<string, unknown>, message?: string) => void;
  info?: (details: Record<string, unknown>, message?: string) => void;
}

const AUDIT_MODULE = "billing";

const serializeDelta = (eventType: string, delta?: Record<string, unknown>) =>
  JSON.stringify({
    eventType,
    ...(delta ?? {})
  });

const recordAudit = async (client: Queryable, audit: AuditInput) => {
  const { tenantId, action, eventType, entityType, entityId, delta } = audit;
  if (!tenantId) return;

  await client.query(
    `
      INSERT INTO audit_events (tenant_id, user_id, module, action, entity_type, entity_id, delta)
      VALUES ($1, NULL, $2, $3, $4, $5, $6::jsonb)
    `,
    [tenantId, AUDIT_MODULE, action, entityType, entityId ?? null, serializeDelta(eventType, delta)]
  );
};

const getRowValue = <T extends Record<string, unknown>>(rows: unknown[], key: keyof T) => {
  const row = rows[0] as T | undefined;
  return row?.[key];
};

const planEntitlementsSchema = z
  .object({
    modules: z
      .array(
        z.object({
          id: z.string(),
          enabled: z.boolean().default(true)
        })
      )
      .default([]),
    featureFlags: z
      .array(
        z.object({
          moduleId: z.string(),
          key: z.string(),
          enabled: z.boolean().default(true)
        })
      )
      .default([])
  })
  .default({});

type PlanEntitlements = z.infer<typeof planEntitlementsSchema>;

const fetchPlanEntitlements = async (
  client: Queryable,
  planId: string,
  logger?: BillingWebhookLogger
): Promise<PlanEntitlements | null> => {
  const result = await client.query("SELECT entitlements FROM plans WHERE id = $1", [planId]);
  if (result.rowCount === 0) {
    const message = `Plan ${planId} not found`;
    logger?.warn?.({ planId }, "billing.webhook.plan_not_found");
    throw new Error(message);
  }
  const row = result.rows[0] as { entitlements?: unknown };
  const parsed = planEntitlementsSchema.safeParse(row?.entitlements ?? {});
  if (!parsed.success) {
    const errorMessage = parsed.error.message;
    logger?.warn?.({ planId, error: errorMessage }, "billing.webhook.plan_entitlements_invalid");
    throw new Error(`Plan entitlements invalid for plan ${planId}: ${errorMessage}`);
  }
  return parsed.data;
};

const upsertPlanModules = async (
  client: Queryable,
  tenantId: string,
  modules: PlanEntitlements["modules"]
) => {
  const existing = await client.query<{ module_id: string }>(
    `SELECT module_id FROM tenant_modules WHERE tenant_id = $1 AND source = 'plan'`,
    [tenantId]
  );
  const keep = new Set<string>();
  for (const module of modules) {
    keep.add(module.id);
    await client.query(
      `
        INSERT INTO tenant_modules (tenant_id, module_id, enabled, source, updated_at)
        VALUES ($1, $2, $3, 'plan', NOW())
        ON CONFLICT (tenant_id, module_id)
        DO UPDATE SET enabled = EXCLUDED.enabled, source = 'plan', updated_at = NOW()
      `,
      [tenantId, module.id, module.enabled]
    );
  }
  for (const row of existing.rows) {
    const moduleId = row.module_id;
    if (!keep.has(moduleId)) {
      await client.query(
        `DELETE FROM tenant_modules WHERE tenant_id = $1 AND module_id = $2 AND source = 'plan'`,
        [tenantId, moduleId]
      );
    }
  }
};

const upsertPlanFeatureFlags = async (
  client: Queryable,
  tenantId: string,
  featureFlags: PlanEntitlements["featureFlags"]
) => {
  const existing = await client.query<{ module_id: string; feature_key: string }>(
    `
      SELECT module_id, feature_key
      FROM tenant_feature_flags
      WHERE tenant_id = $1 AND overridden = FALSE
    `,
    [tenantId]
  );
  const keep = new Set<string>();
  for (const feature of featureFlags) {
    const key = `${feature.moduleId}:${feature.key}`;
    keep.add(key);
    await client.query(
      `
        INSERT INTO tenant_feature_flags (tenant_id, module_id, feature_key, enabled, overridden, updated_at)
        VALUES ($1, $2, $3, $4, FALSE, NOW())
        ON CONFLICT (tenant_id, module_id, feature_key)
        DO UPDATE SET enabled = EXCLUDED.enabled, overridden = FALSE, updated_at = NOW()
      `,
      [tenantId, feature.moduleId, feature.key, feature.enabled]
    );
  }
  for (const row of existing.rows) {
    const featureKey = `${row.module_id}:${row.feature_key}`;
    if (!keep.has(featureKey)) {
      await client.query(
        `
          DELETE FROM tenant_feature_flags
          WHERE tenant_id = $1 AND module_id = $2 AND feature_key = $3 AND overridden = FALSE
        `,
        [tenantId, row.module_id, row.feature_key]
      );
    }
  }
};

const synchronizePlanEntitlements = async (
  client: Queryable,
  tenantId: string,
  planId: string,
  logger?: BillingWebhookLogger
) => {
  const entitlements = await fetchPlanEntitlements(client, planId, logger);
  if (!entitlements) return;
  await upsertPlanModules(client, tenantId, entitlements.modules ?? []);
  await upsertPlanFeatureFlags(client, tenantId, entitlements.featureFlags ?? []);
};

const clearPlanEntitlements = async (client: Queryable, tenantId: string) => {
  await client.query("DELETE FROM tenant_modules WHERE tenant_id = $1 AND source = 'plan'", [tenantId]);
  await client.query(
    "DELETE FROM tenant_feature_flags WHERE tenant_id = $1 AND overridden = FALSE",
    [tenantId]
  );
};

export const parseIsoOrNull = (value?: string | null) => (value ? new Date(value) : null);

export async function applyBillingWebhookEvent(
  client: Queryable,
  event: BillingWebhookEvent,
  logger?: BillingWebhookLogger
) {
  switch (event.type) {
    case "subscription.activated": {
      const { subscriptionId, tenantId, planId, billingCycle, currentPeriodEnd } = event.data;
      await client.query(
        `
          INSERT INTO subscriptions (id, tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end, cancel_at_period_end)
          VALUES ($1, $2, $3, 'active', $4, NOW(), $5, FALSE)
          ON CONFLICT (id)
          DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            plan_id = EXCLUDED.plan_id,
            status = 'active',
            billing_cycle = EXCLUDED.billing_cycle,
            current_period_start = NOW(),
            current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = FALSE,
            updated_at = NOW()
        `,
        [subscriptionId, tenantId, planId, billingCycle, parseIsoOrNull(currentPeriodEnd)]
      );

      await synchronizePlanEntitlements(client, tenantId, planId, logger);

      await recordAudit(client, {
        tenantId,
        action: "billing.subscription.activated",
        eventType: event.type,
        entityType: "subscription",
        entityId: subscriptionId,
        delta: {
          planId,
          billingCycle,
          currentPeriodEnd
        }
      });
      break;
    }
    case "subscription.past_due": {
      const result = await client.query(
        `
          UPDATE subscriptions
          SET status = 'past_due',
              updated_at = NOW()
          WHERE id = $1
          RETURNING tenant_id
        `,
        [event.data.subscriptionId]
      );
      if (result.rowCount === 0) {
        logger?.warn({ subscriptionId: event.data.subscriptionId }, "billing.webhook.subscriptionPastDue.unknown");
        break;
      }

      const tenantId = getRowValue<{ tenant_id?: string }>(result.rows, "tenant_id");
      await recordAudit(client, {
        tenantId: typeof tenantId === "string" ? tenantId : undefined,
        action: "billing.subscription.past_due",
        eventType: event.type,
        entityType: "subscription",
        entityId: event.data.subscriptionId,
        delta: {
          status: "past_due"
        }
      });
      break;
    }
    case "subscription.canceled": {
      const { subscriptionId, cancelAtPeriodEnd, currentPeriodEnd } = event.data;
      const result = await client.query(
        `
          UPDATE subscriptions
          SET status = 'canceled',
              cancel_at_period_end = COALESCE($2, TRUE),
              current_period_end = COALESCE($3, current_period_end),
              updated_at = NOW()
          WHERE id = $1
          RETURNING tenant_id, cancel_at_period_end, current_period_end
        `,
        [subscriptionId, cancelAtPeriodEnd ?? true, parseIsoOrNull(currentPeriodEnd ?? null)]
      );
      if (result.rowCount === 0) {
        logger?.warn({ subscriptionId }, "billing.webhook.subscriptionCanceled.unknown");
        break;
      }

      const tenantId = getRowValue<{ tenant_id?: string }>(result.rows, "tenant_id");
      if (typeof tenantId === "string") {
        await clearPlanEntitlements(client, tenantId);
      }

      const row = result.rows[0] as {
        tenant_id?: string;
        cancel_at_period_end?: boolean;
        current_period_end?: Date;
      };

      await recordAudit(client, {
        tenantId: typeof row?.tenant_id === "string" ? row.tenant_id : undefined,
        action: "billing.subscription.canceled",
        eventType: event.type,
        entityType: "subscription",
        entityId: subscriptionId,
        delta: {
          cancelAtPeriodEnd: row?.cancel_at_period_end ?? cancelAtPeriodEnd ?? true,
          currentPeriodEnd: row?.current_period_end ?? parseIsoOrNull(currentPeriodEnd ?? null)
        }
      });
      break;
    }
    case "subscription.plan_changed": {
      const { subscriptionId, tenantId, planId, billingCycle } = event.data;
      const result = await client.query(
        `
          UPDATE subscriptions
          SET plan_id = $2,
              billing_cycle = $3,
              status = 'active',
              updated_at = NOW()
          WHERE id = $1
        `,
        [subscriptionId, planId, billingCycle]
      );

      if (result.rowCount === 0) {
        throw new Error(`Subscription ${subscriptionId} not found for plan change`);
      }

      await synchronizePlanEntitlements(client, tenantId, planId, logger);

      await recordAudit(client, {
        tenantId,
        action: "billing.subscription.plan_changed",
        eventType: event.type,
        entityType: "subscription",
        entityId: subscriptionId,
        delta: {
          planId,
          billingCycle
        }
      });
      break;
    }
    case "invoice.created": {
      const { invoiceId, tenantId, subscriptionId, currency, totalDue, dueAt } = event.data;
      await client.query(
        `
          INSERT INTO invoices (id, tenant_id, subscription_id, status, currency, total_due, total_paid, due_at, created_at, updated_at)
          VALUES ($1, $2, $3, 'open', $4, $5, 0, $6, NOW(), NOW())
          ON CONFLICT (id)
          DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            subscription_id = EXCLUDED.subscription_id,
            status = 'open',
            currency = EXCLUDED.currency,
            total_due = EXCLUDED.total_due,
            due_at = EXCLUDED.due_at,
            updated_at = NOW()
        `,
        [invoiceId, tenantId, subscriptionId, currency, totalDue, parseIsoOrNull(dueAt ?? null)]
      );

      await recordAudit(client, {
        tenantId,
        action: "billing.invoice.created",
        eventType: event.type,
        entityType: "invoice",
        entityId: invoiceId,
        delta: {
          subscriptionId,
          currency,
          totalDue,
          dueAt
        }
      });
      break;
    }
    case "invoice.payment_succeeded": {
      const { invoiceId, paidAmount } = event.data;
      const result = await client.query(
        `
          UPDATE invoices
          SET status = 'paid',
              total_paid = COALESCE($2, total_due),
              updated_at = NOW()
          WHERE id = $1
          RETURNING tenant_id, total_paid
        `,
        [invoiceId, paidAmount ?? null]
      );
      if (result.rowCount === 0) {
        logger?.warn({ invoiceId }, "billing.webhook.invoicePaymentSucceeded.unknown");
        break;
      }

      const row = result.rows[0] as { tenant_id?: string; total_paid?: number };
      await recordAudit(client, {
        tenantId: typeof row?.tenant_id === "string" ? row.tenant_id : undefined,
        action: "billing.invoice.payment_succeeded",
        eventType: event.type,
        entityType: "invoice",
        entityId: invoiceId,
        delta: {
          paidAmount: paidAmount ?? row?.total_paid
        }
      });
      break;
    }
    case "invoice.payment_failed": {
      const { invoiceId } = event.data;
      const result = await client.query(
        `
          UPDATE invoices
          SET status = 'open',
              updated_at = NOW()
          WHERE id = $1
          RETURNING tenant_id
        `,
        [invoiceId]
      );
      if (result.rowCount === 0) {
        logger?.warn({ invoiceId }, "billing.webhook.invoicePaymentFailed.unknown");
        break;
      }

      const tenantId = getRowValue<{ tenant_id?: string }>(result.rows, "tenant_id");
      await recordAudit(client, {
        tenantId: typeof tenantId === "string" ? tenantId : undefined,
        action: "billing.invoice.payment_failed",
        eventType: event.type,
        entityType: "invoice",
        entityId: invoiceId,
        delta: {
          status: "open"
        }
      });
      break;
    }
  }
}

export type BillingWebhookJobData = {
  eventId: string;
  eventType: BillingWebhookEvent["type"];
};
