import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../../../db.js";
import { requirePermissions } from "../../../plugins/authorize.js";
import { billingSummaryGauges } from "../../../metrics.js";
import { Errors } from "../../../errors.js";

const summaryQuery = `
  SELECT
    COALESCE((
      SELECT COUNT(DISTINCT tenant_id)
      FROM subscriptions
      WHERE status IN ('trialing', 'active')
    ), 0) AS active_tenant_count,
    COALESCE((
      SELECT SUM(plans.price_cents)
      FROM subscriptions
      JOIN plans ON plans.id = subscriptions.plan_id
      WHERE subscriptions.status IN ('trialing', 'active')
    ), 0) AS monthly_recurring_revenue_cents,
    COALESCE((
      SELECT COUNT(DISTINCT tenant_id)
      FROM subscriptions
      WHERE status = 'past_due'
    ), 0) AS past_due_tenant_count,
    COALESCE((
      SELECT COUNT(*)
      FROM subscriptions
      WHERE status IN ('trialing', 'active')
        AND current_period_end IS NOT NULL
        AND current_period_end BETWEEN NOW() AND NOW() + INTERVAL '14 days'
    ), 0) AS upcoming_renewal_count,
    COALESCE((
      SELECT COUNT(*)
      FROM subscriptions
      WHERE cancel_at_period_end = TRUE
        AND status IN ('trialing', 'active')
    ), 0) AS cancel_at_period_end_count,
    COALESCE((
      SELECT COUNT(*)
      FROM invoices
      WHERE status = 'open'
    ), 0) AS open_invoice_count,
    (
      SELECT jsonb_agg(row_to_json(plan_rows))
      FROM (
        SELECT
          subscriptions.id,
          tenants.name AS tenant_name,
          plans.name AS plan_name,
          plans.price_cents,
          subscriptions.current_period_end,
          subscriptions.status
        FROM subscriptions
        JOIN tenants ON tenants.id = subscriptions.tenant_id
        JOIN plans ON plans.id = subscriptions.plan_id
        WHERE subscriptions.status IN ('trialing', 'active')
        ORDER BY subscriptions.current_period_end ASC NULLS LAST
        LIMIT 5
      ) AS plan_rows
    ) AS upcoming_renewals,
    (
      SELECT jsonb_agg(row_to_json(invoice_rows))
      FROM (
        SELECT
          invoices.id,
          tenants.name AS tenant_name,
          invoices.total_due,
          invoices.due_at,
          invoices.status
        FROM invoices
        JOIN tenants ON tenants.id = invoices.tenant_id
        WHERE invoices.status = 'open'
        ORDER BY invoices.due_at ASC NULLS LAST
        LIMIT 5
      ) AS invoice_rows
    ) AS open_invoices
`;

const paginationSchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .default("25")
    .transform((value) => Number.parseInt(String(value), 10))
    .refine((value) => Number.isFinite(value) && value > 0 && value <= 100, {
      message: "limit must be between 1 and 100"
    }),
  offset: z
    .union([z.string(), z.number()])
    .default("0")
    .transform((value) => Number.parseInt(String(value), 10))
    .refine((value) => Number.isFinite(value) && value >= 0, {
      message: "offset must be >= 0"
    })
});

export const registerSuperadminBillingRoutes = async (app: FastifyInstance) => {
  app.get(
    "/superadmin/billing/summary",
    { preHandler: requirePermissions("tenant_registrations.read") },
    async () => {
      const client = await pool.connect();
      try {
        const result = await client.query(summaryQuery);
        const row = result.rows[0] ?? {};
        const upcomingRenewals = Array.isArray(row.upcoming_renewals)
          ? row.upcoming_renewals.map((item: Record<string, unknown>) => ({
              id: String(item.id),
              tenantName: String(item.tenant_name ?? "Unknown tenant"),
              planName: String(item.plan_name ?? "Unknown plan"),
              priceCents: Number(item.price_cents ?? 0),
              currentPeriodEnd: item.current_period_end ?? null,
              status: String(item.status ?? "unknown")
            }))
          : [];
        const openInvoices = Array.isArray(row.open_invoices)
          ? row.open_invoices.map((item: Record<string, unknown>) => ({
              id: String(item.id),
              tenantName: String(item.tenant_name ?? "Unknown tenant"),
              totalDue: Number(item.total_due ?? 0),
              dueAt: item.due_at ?? null,
              status: String(item.status ?? "unknown")
            }))
          : [];
        billingSummaryGauges.activeTenants.set(Number(row.active_tenant_count ?? 0));
        billingSummaryGauges.monthlyRecurringRevenueCents.set(
          Number(row.monthly_recurring_revenue_cents ?? 0)
        );
        billingSummaryGauges.pastDueTenants.set(Number(row.past_due_tenant_count ?? 0));
        billingSummaryGauges.upcomingRenewals.set(Number(row.upcoming_renewal_count ?? 0));
        billingSummaryGauges.cancelAtPeriodEnd.set(Number(row.cancel_at_period_end_count ?? 0));
        billingSummaryGauges.openInvoices.set(Number(row.open_invoice_count ?? 0));
        return {
          data: {
            activeTenantCount: Number(row.active_tenant_count ?? 0),
            monthlyRecurringRevenueCents: Number(row.monthly_recurring_revenue_cents ?? 0),
            pastDueTenantCount: Number(row.past_due_tenant_count ?? 0),
            upcomingRenewalCount: Number(row.upcoming_renewal_count ?? 0),
            cancelAtPeriodEndCount: Number(row.cancel_at_period_end_count ?? 0),
            openInvoiceCount: Number(row.open_invoice_count ?? 0),
            upcomingRenewals,
            openInvoices
          }
        };
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/superadmin/billing/renewals",
    { preHandler: requirePermissions("tenant_registrations.read") },
    async (request) => {
      const parsed = paginationSchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        throw Errors.validation("Invalid pagination parameters", parsed.error.flatten().fieldErrors);
      }
      const { limit, offset } = parsed.data;
      const client = await pool.connect();
      try {
        const renewals = await client.query(
          `
            SELECT
              subscriptions.id,
              tenants.id AS tenant_id,
              tenants.name AS tenant_name,
              plans.id AS plan_id,
              plans.name AS plan_name,
              plans.price_cents,
              subscriptions.current_period_end,
              subscriptions.status
            FROM subscriptions
            JOIN tenants ON tenants.id = subscriptions.tenant_id
            JOIN plans ON plans.id = subscriptions.plan_id
            WHERE subscriptions.status IN ('trialing', 'active')
              AND subscriptions.current_period_end IS NOT NULL
            ORDER BY subscriptions.current_period_end ASC NULLS LAST
            LIMIT $1 OFFSET $2
          `,
          [limit, offset]
        );
        return {
          data: renewals.rows.map((row) => ({
            subscriptionId: String(row.id),
            tenantId: String(row.tenant_id),
            tenantName: String(row.tenant_name ?? "Unknown tenant"),
            planId: String(row.plan_id),
            planName: String(row.plan_name ?? "Unknown plan"),
            priceCents: Number(row.price_cents ?? 0),
            currentPeriodEnd: row.current_period_end ?? null,
            status: String(row.status ?? "unknown")
          })),
          meta: {
            limit,
            offset
          }
        };
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/superadmin/billing/open-invoices",
    { preHandler: requirePermissions("tenant_registrations.read") },
    async (request) => {
      const parsed = paginationSchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        throw Errors.validation("Invalid pagination parameters", parsed.error.flatten().fieldErrors);
      }
      const { limit, offset } = parsed.data;
      const client = await pool.connect();
      try {
        const invoices = await client.query(
          `
            SELECT
              invoices.id,
              invoices.tenant_id,
              tenants.name AS tenant_name,
              invoices.total_due,
              invoices.due_at,
              invoices.status
            FROM invoices
            JOIN tenants ON tenants.id = invoices.tenant_id
            WHERE invoices.status = 'open'
            ORDER BY invoices.due_at ASC NULLS LAST
            LIMIT $1 OFFSET $2
          `,
          [limit, offset]
        );
        return {
          data: invoices.rows.map((row) => ({
            invoiceId: String(row.id),
            tenantId: String(row.tenant_id),
            tenantName: String(row.tenant_name ?? "Unknown tenant"),
            totalDue: Number(row.total_due ?? 0),
            dueAt: row.due_at ?? null,
            status: String(row.status ?? "unknown")
          })),
          meta: {
            limit,
            offset
          }
        };
      } finally {
        client.release();
      }
    }
  );
};
