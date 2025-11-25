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

  const { registerSuperadminAnalyticsRoutes } = await import("../routes/analytics.js");
  await registerSuperadminAnalyticsRoutes(app);
  return app;
};

describe("superadmin analytics routes", () => {
  let app: FastifyInstance;
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetAllMocks();
    client = {
      query: vi.fn(),
      release: vi.fn()
    };
    poolMock.connect.mockResolvedValue(client);
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns module toggle totals for the default window", async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        { module_key: "inventory", enabled_count: 5, disabled_count: 1 },
        { module_key: "pos", enabled_count: 7, disabled_count: 0 }
      ]
    });

    const response = await app.inject({
      method: "GET",
      url: "/superadmin/analytics/module-toggles"
    });
    const payload = response.json();
    expect(response.statusCode).toBe(200);
    expect(payload).toEqual({
      data: {
        windowDays: 30,
        totals: [
          { module: "inventory", enabledCount: 5, disabledCount: 1 },
          { module: "pos", enabledCount: 7, disabledCount: 0 }
        ]
      }
    });

    expect(client.query).toHaveBeenCalledWith(expect.any(String), [30]);
    expect(client.release).toHaveBeenCalled();
  });

  it("validates windowDays bounds", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/superadmin/analytics/module-toggles?windowDays=0"
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toEqual({
      error: {
        code: "VALIDATION",
        message: "windowDays must be between 1 and 180"
      }
    });
  });
});
