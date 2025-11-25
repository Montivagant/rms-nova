import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolMock = vi.hoisted(() => ({
  connect: vi.fn()
}));

vi.mock("../../../db.js", () => ({
  pool: poolMock
}));

const createApp = async () => {
  const app = Fastify({ logger: { level: "silent" } });
  app.decorateRequest("user", null);
  app.addHook("onRequest", (request, _reply, done) => {
    request.user = {
      id: "user-1",
      tenantId: "tenant-1",
      roles: ["superadmin"],
      permissions: ["tenant_registrations.read", "*"]
    };
    done();
  });

  const { mapErrorToResponse } = await import("../../../errors.js");
  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = mapErrorToResponse(error);
    void reply.status(statusCode).send(body);
  });

  const { registerSuperadminBillingRoutes } = await import("../routes/billing.js");
  await registerSuperadminBillingRoutes(app);
  return app;
};

describe("superadmin billing routes", () => {
  let app: FastifyInstance;
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetAllMocks();
    client = {
      query: vi.fn(),
      release: vi.fn()
    };
    poolMock.connect.mockResolvedValue(client);
    const { billingSummaryGauges } = await import("../../../metrics.js");
    billingSummaryGauges.activeTenants.reset();
    billingSummaryGauges.monthlyRecurringRevenueCents.reset();
    billingSummaryGauges.pastDueTenants.reset();
    billingSummaryGauges.upcomingRenewals.reset();
    billingSummaryGauges.cancelAtPeriodEnd.reset();
    billingSummaryGauges.openInvoices.reset();
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns billing summary metrics", async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        {
          active_tenant_count: 12,
          monthly_recurring_revenue_cents: 1280000,
          past_due_tenant_count: 3,
          upcoming_renewal_count: 5,
          cancel_at_period_end_count: 2,
          open_invoice_count: 4,
          upcoming_renewals: [
            {
              id: "sub-1",
              tenant_name: "Nova Eats",
              plan_name: "Growth",
              price_cents: 29900,
              current_period_end: "2025-11-01T00:00:00Z",
              status: "active"
            }
          ],
          open_invoices: [
            {
              id: "inv-1",
              tenant_name: "Nova Eats",
              total_due: 499.5,
              due_at: "2025-10-25T00:00:00Z",
              status: "open"
            }
          ]
        }
      ]
    });

    const response = await app.inject({
      method: "GET",
      url: "/superadmin/billing/summary"
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      data: {
        activeTenantCount: 12,
        monthlyRecurringRevenueCents: 1_280_000,
        pastDueTenantCount: 3,
        upcomingRenewalCount: 5,
        cancelAtPeriodEndCount: 2,
        openInvoiceCount: 4,
        upcomingRenewals: [
          {
            id: "sub-1",
            tenantName: "Nova Eats",
            planName: "Growth",
            priceCents: 29_900,
            currentPeriodEnd: "2025-11-01T00:00:00Z",
            status: "active"
          }
        ],
        openInvoices: [
          {
            id: "inv-1",
            tenantName: "Nova Eats",
            totalDue: 499.5,
            dueAt: "2025-10-25T00:00:00Z",
            status: "open"
          }
        ]
      }
    });
    const { metricsRegistry } = await import("../../../metrics.js");
    const metricsOutput = await metricsRegistry.metrics();
    expect(metricsOutput).toMatch(/nova_api_billing_active_tenants\s+12(\.0+)?/);
    expect(metricsOutput).toMatch(/nova_api_billing_mrr_cents\s+1280000(\.0+)?/);
    expect(metricsOutput).toMatch(/nova_api_billing_past_due_tenants\s+3(\.0+)?/);
    expect(metricsOutput).toMatch(/nova_api_billing_upcoming_renewals\s+5(\.0+)?/);
    expect(metricsOutput).toMatch(/nova_api_billing_cancel_at_period_end\s+2(\.0+)?/);
    expect(metricsOutput).toMatch(/nova_api_billing_open_invoices\s+4(\.0+)?/);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalled();
  });

  it("falls back to zero values when no rows returned", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/superadmin/billing/summary"
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      data: {
        activeTenantCount: 0,
        monthlyRecurringRevenueCents: 0,
        pastDueTenantCount: 0,
        upcomingRenewalCount: 0,
        cancelAtPeriodEndCount: 0,
        openInvoiceCount: 0,
        upcomingRenewals: [],
        openInvoices: []
      }
    });
    const { metricsRegistry } = await import("../../../metrics.js");
    const metricsOutput = await metricsRegistry.metrics();
    expect(metricsOutput).toMatch(/nova_api_billing_active_tenants\s+0(\.0+)?/);
    expect(metricsOutput).toMatch(/nova_api_billing_open_invoices\s+0(\.0+)?/);
  });

  it("lists upcoming renewals with pagination defaults", async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        {
          id: "sub-1",
          tenant_id: "tenant-1",
          tenant_name: "Nova Eats",
          plan_id: "plan-1",
          plan_name: "Growth",
          price_cents: 29900,
          current_period_end: "2025-11-01T00:00:00Z",
          status: "active"
        }
      ]
    });

    const response = await app.inject({
      method: "GET",
      url: "/superadmin/billing/renewals"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          subscriptionId: "sub-1",
          tenantId: "tenant-1",
          tenantName: "Nova Eats",
          planId: "plan-1",
          planName: "Growth",
          priceCents: 29_900,
          currentPeriodEnd: "2025-11-01T00:00:00Z",
          status: "active"
        }
      ],
      meta: {
        limit: 25,
        offset: 0
      }
    });
  });

  it("validates renewals pagination parameters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/superadmin/billing/renewals?limit=0"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "Invalid pagination parameters",
        details: {
          limit: ["limit must be between 1 and 100"]
        }
      }
    });
  });

  it("lists open invoices respecting pagination", async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        {
          id: "inv-1",
          tenant_id: "tenant-1",
          tenant_name: "Nova Eats",
          total_due: 499.5,
          due_at: "2025-10-25T00:00:00Z",
          status: "open"
        }
      ]
    });

    const response = await app.inject({
      method: "GET",
      url: "/superadmin/billing/open-invoices?limit=10&offset=5"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          invoiceId: "inv-1",
          tenantId: "tenant-1",
          tenantName: "Nova Eats",
          totalDue: 499.5,
          dueAt: "2025-10-25T00:00:00Z",
          status: "open"
        }
      ],
      meta: {
        limit: 10,
        offset: 5
      }
    });
  });

  it("validates open invoices pagination parameters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/superadmin/billing/open-invoices?offset=-1"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "Invalid pagination parameters",
        details: {
          offset: ["offset must be >= 0"]
        }
      }
    });
  });
});
