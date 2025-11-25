import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolMock = vi.hoisted(() => ({
  connect: vi.fn()
}));

const enqueueMock = vi.hoisted(() => vi.fn());

vi.mock("../../../db.js", () => ({
  pool: poolMock
}));

vi.mock("../../../queues/billing-webhook.js", () => ({
  enqueueBillingWebhook: enqueueMock
}));

const createApp = async () => {
  const app = Fastify({ logger: { level: "silent" } });
  const { mapErrorToResponse } = await import("../../../errors.js");
  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = mapErrorToResponse(error);
    void reply.status(statusCode).send(body);
  });
  const { registerBillingWebhookRoutes } = await import("../routes/webhooks.js");
  await registerBillingWebhookRoutes(app);
  return app;
};

describe("billing webhook routes", () => {
  let app: FastifyInstance;
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  let insertedEventId: string;
  const originalSecret = process.env.BILLING_WEBHOOK_SECRET;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.BILLING_WEBHOOK_SECRET = "sandbox-secret";
    insertedEventId = randomUUID();
    client = {
      query: vi.fn(),
      release: vi.fn()
    };
    client.query.mockImplementation(async (sql: unknown) => {
      if (typeof sql === "string") {
        if (sql.includes("INSERT INTO billing_webhook_events")) {
          return { rows: [{ id: insertedEventId }], rowCount: 1 };
        }
        if (sql.includes("UPDATE billing_webhook_events")) {
          return { rows: [], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue(client);
    app = await createApp();
  });

  afterEach(async () => {
    process.env.BILLING_WEBHOOK_SECRET = originalSecret;
    await app.close();
  });

  it("rejects webhooks with invalid signature when secret is set", async () => {
    const subscriptionId = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: "/billing/webhooks/sandbox",
      payload: { type: "subscription.past_due", data: { subscriptionId } },
      headers: {
        "x-sandbox-signature": "wrong"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(client.query).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("queues webhook events once persisted", async () => {
    const subscriptionId = randomUUID();
    const tenantId = randomUUID();
    const planId = randomUUID();

    const response = await app.inject({
      method: "POST",
      url: "/billing/webhooks/sandbox",
      headers: {
        "x-sandbox-signature": "sandbox-secret"
      },
      payload: {
        type: "subscription.activated",
        data: {
          subscriptionId,
          tenantId,
          planId,
          billingCycle: "monthly",
          currentPeriodEnd: new Date().toISOString()
        }
      }
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.data.status).toBe("queued");
    expect(body.data.eventId).toBe(insertedEventId);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO billing_webhook_events"), expect.any(Array));
    expect(enqueueMock).toHaveBeenCalledWith({ eventId: insertedEventId, eventType: "subscription.activated" });
    expect(client.release).toHaveBeenCalled();
  });

  it("marks event failed when enqueueing the job throws", async () => {
    enqueueMock.mockRejectedValueOnce(new Error("redis down"));

    const subscriptionId = randomUUID();

    const response = await app.inject({
      method: "POST",
      url: "/billing/webhooks/sandbox",
      headers: {
        "x-sandbox-signature": "sandbox-secret"
      },
      payload: {
        type: "subscription.past_due",
        data: {
          subscriptionId
        }
      }
    });

    expect(response.statusCode).toBe(500);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE billing_webhook_events"), expect.any(Array));
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it("returns validation error for unknown type", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/billing/webhooks/sandbox",
      headers: {
        "x-sandbox-signature": "sandbox-secret"
      },
      payload: {
        type: "unknown.event",
        data: {}
      }
    });

    expect(response.statusCode).toBe(400);
  });
});
