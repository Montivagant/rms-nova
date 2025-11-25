import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { applyBillingWebhookEvent } from "../index";

const createMockClient = () => ({
  query: vi.fn()
});

const createLogger = () => ({
  warn: vi.fn(),
  info: vi.fn()
});

describe("applyBillingWebhookEvent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("synchronizes entitlements and records audit on subscription activation", async () => {
    const client = createMockClient();
    const logger = createLogger();
    const subscriptionId = randomUUID();
    const tenantId = randomUUID();
    const planId = randomUUID();
    const moduleInserts: unknown[][] = [];
    const featureInserts: unknown[][] = [];
    const planEntitlements = {
      modules: [{ id: "pos", enabled: true }],
      featureFlags: [{ moduleId: "pos", key: "table_service", enabled: true }]
    };

    client.query.mockImplementation(async (sql, params) => {
      if (typeof sql !== "string") return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO subscriptions")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT entitlements FROM plans")) {
        return { rows: [{ entitlements: planEntitlements }], rowCount: 1 };
      }
      if (sql.includes("SELECT module_id FROM tenant_modules")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO tenant_modules")) {
        moduleInserts.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("DELETE FROM tenant_modules")) {
        throw new Error("unexpected plan module deletion");
      }
      if (sql.includes("SELECT module_id, feature_key FROM tenant_feature_flags")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO tenant_feature_flags")) {
        featureInserts.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("DELETE FROM tenant_feature_flags")) {
        throw new Error("unexpected feature flag deletion");
      }
      if (sql.includes("INSERT INTO audit_events")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await applyBillingWebhookEvent(
      client,
      {
        type: "subscription.activated",
        data: {
          subscriptionId,
          tenantId,
          planId,
          billingCycle: "monthly",
          currentPeriodEnd: new Date().toISOString()
        }
      },
      logger
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT entitlements FROM plans"),
      [planId]
    );
    expect(moduleInserts).toContainEqual([tenantId, "pos", true]);
    expect(featureInserts).toContainEqual([tenantId, "pos", "table_service", true]);
    const auditCall = client.query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO audit_events")
    );
    expect(auditCall).toBeTruthy();
    if (!auditCall) {
      throw new Error("Expected audit event call to be recorded");
    }
    const delta = JSON.parse(auditCall[1][5] as string);
    expect(delta.eventType).toBe("subscription.activated");
    expect(delta.planId).toBe(planId);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("records audit event for subscription past due when subscription exists", async () => {
    const client = createMockClient();
    const logger = createLogger();
    const subscriptionId = randomUUID();
    const tenantId = randomUUID();

    client.query
      .mockResolvedValueOnce({ rows: [{ tenant_id: tenantId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await applyBillingWebhookEvent(
      client,
      {
        type: "subscription.past_due",
        data: {
          subscriptionId
        }
      },
      logger
    );

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("UPDATE subscriptions"),
      [subscriptionId]
    );
    const auditCall = client.query.mock.calls[1];
    expect(auditCall).toBeTruthy();
    if (!auditCall) {
      throw new Error("Expected audit event call for past_due status");
    }
    expect(auditCall[0]).toContain("INSERT INTO audit_events");
    expect(JSON.parse(auditCall[1][5] as string)).toMatchObject({
      eventType: "subscription.past_due",
      status: "past_due"
    });
  });

  it("clears plan entitlements when subscription is canceled", async () => {
    const client = createMockClient();
    const logger = createLogger();
    const subscriptionId = randomUUID();
    const tenantId = randomUUID();
    const deleteModuleCalls: unknown[][] = [];
    const deleteFeatureCalls: unknown[][] = [];

    client.query.mockImplementation(async (sql, params) => {
      if (typeof sql !== "string") return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE subscriptions")) {
        return {
          rows: [
            {
              tenant_id: tenantId,
              cancel_at_period_end: true,
              current_period_end: new Date()
            }
          ],
          rowCount: 1
        };
      }
      if (sql.includes("DELETE FROM tenant_modules")) {
        deleteModuleCalls.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("DELETE FROM tenant_feature_flags")) {
        deleteFeatureCalls.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_events")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await applyBillingWebhookEvent(
      client,
      {
        type: "subscription.canceled",
        data: {
          subscriptionId,
          cancelAtPeriodEnd: true
        }
      },
      logger
    );

    expect(deleteModuleCalls).toContainEqual([tenantId]);
    expect(deleteFeatureCalls).toContainEqual([tenantId]);
  });

  it("warns when cancellation targets unknown subscription", async () => {
    const client = createMockClient();
    const logger = createLogger();

    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await applyBillingWebhookEvent(
      client,
      {
        type: "subscription.canceled",
        data: {
          subscriptionId: randomUUID()
        }
      },
      logger
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: expect.any(String) }),
      "billing.webhook.subscriptionCanceled.unknown"
    );
  });

  it("updates entitlements when subscription plan changes", async () => {
    const client = createMockClient();
    const logger = createLogger();
    const subscriptionId = randomUUID();
    const tenantId = randomUUID();
    const newPlanId = randomUUID();
    const updateCalls: unknown[][] = [];
    const deleteModuleCalls: unknown[][] = [];

    client.query.mockImplementation(async (sql, params) => {
      if (typeof sql !== "string") return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE subscriptions") && sql.includes("SET plan_id")) {
        updateCalls.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT entitlements FROM plans")) {
        return {
          rows: [
            {
              entitlements: {
                modules: [{ id: "inventory", enabled: true }],
                featureFlags: []
              }
            }
          ],
          rowCount: 1
        };
      }
      if (sql.includes("SELECT module_id FROM tenant_modules")) {
        return { rows: [{ module_id: "pos" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO tenant_modules")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("DELETE FROM tenant_modules")) {
        deleteModuleCalls.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT module_id, feature_key FROM tenant_feature_flags")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO audit_events")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await applyBillingWebhookEvent(
      client,
      {
        type: "subscription.plan_changed",
        data: {
          subscriptionId,
          tenantId,
          planId: newPlanId,
          billingCycle: "monthly"
        }
      },
      logger
    );

    expect(updateCalls).toContainEqual([subscriptionId, newPlanId, "monthly"]);
    expect(deleteModuleCalls).toContainEqual([tenantId, "pos"]);
  });

  it("records audit event for invoice payment succeeded", async () => {
    const client = createMockClient();
    const logger = createLogger();
    const invoiceId = randomUUID();
    const tenantId = randomUUID();

    client.query
      .mockResolvedValueOnce({ rows: [{ tenant_id: tenantId, total_paid: 5000 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await applyBillingWebhookEvent(
      client,
      {
        type: "invoice.payment_succeeded",
        data: {
          invoiceId,
          paidAmount: 5000
        }
      },
      logger
    );

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("UPDATE invoices"),
      [invoiceId, 5000]
    );
    const auditCall = client.query.mock.calls[1];
    expect(auditCall).toBeTruthy();
    if (!auditCall) {
      throw new Error("Expected audit event for invoice payment");
    }
    expect(auditCall[0]).toContain("INSERT INTO audit_events");
    expect(JSON.parse(auditCall[1][5] as string)).toMatchObject({
      eventType: "invoice.payment_succeeded",
      paidAmount: 5000
    });
  });
});
