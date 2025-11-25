import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolMock = vi.hoisted(() => ({
  connect: vi.fn()
}));

vi.mock("../../../db.js", () => ({
  pool: poolMock
}));

vi.mock("@nova/auth", () => ({
  hashPassword: vi.fn()
}));

const defaultModules = [
  { key: "pos", name: "Point of Sale", enabled: true, category: "Operations" },
  { key: "inventory", name: "Inventory", enabled: true, category: "Operations" },
  { key: "menu", name: "Menu Manager", enabled: false, category: "Operations" },
  { key: "reports", name: "Reporting & Insights", enabled: false, category: "Insights" }
];

const ensureClient = {
  query: vi.fn().mockResolvedValue({}),
  release: vi.fn()
};
poolMock.connect.mockResolvedValue(ensureClient as unknown as { query: () => Promise<unknown>; release: () => void });

const { hashPassword } = await import("@nova/auth");
const { mapErrorToResponse } = await import("../../../errors.js");
const { registerRegistrationRoutes } = await import("../routes/registration.js");

const registrationSample = {
  id: "11111111-1111-1111-1111-111111111111",
  status: "pending",
  business: {
    legalName: "Nova Eats LLC",
    doingBusinessAs: "Nova Eats",
    contactEmail: "contact@nova.test",
    contactPhone: "123456789",
    country: "US",
    timezone: "America/New_York"
  },
  owner: {
    firstName: "Nora",
    lastName: "Owner",
    email: "owner@nova.test",
    password: "Sup3rSecret!"
  },
  modules: defaultModules
};

const createApp = async () => {
  const app = Fastify({ logger: { level: "silent" } });
  app.decorateRequest("user", null);
  app.addHook("onRequest", (request, _reply, done) => {
    request.user = {
      id: "user-1",
      tenantId: "tenant-1",
      roles: ["superadmin"],
      permissions: [
        "tenant_registrations.read",
        "tenant_registrations.approve",
        "tenant_registrations.reject",
        "*"
      ]
    };
    done();
  });
  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = mapErrorToResponse(error);
    void reply.status(statusCode).send(body);
  });
  await registerRegistrationRoutes(app);
  return app;
};

describe("registration routes", () => {
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

  it("stores registration submissions", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "reg-123" }] });

    const payload = {
      business: registrationSample.business,
      owner: registrationSample.owner
    };

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ data: { registrationId: "reg-123" } });
    const insertCall = client.query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO tenant_registrations")
    );
    expect(insertCall?.[1]).toEqual([
      payload.business,
      payload.owner,
      JSON.stringify(defaultModules)
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  it("approves a pending registration and seeds tenant + owner", async () => {
    const calls: Array<{ sql: unknown; params: unknown[] | undefined }> = [];
    client.query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      calls.push({ sql, params });
      if (typeof sql === "string" && sql.includes("SELECT * FROM tenant_registrations")) {
        return { rowCount: 1, rows: [registrationSample] };
      }
      return {};
    });
    vi.mocked(hashPassword).mockResolvedValue({
      hash: "hashed",
      salt: "salt",
      iterations: 100,
      algorithm: "sha512"
    });

    const response = await app.inject({
      method: "POST",
      url: `/superadmin/registrations/${registrationSample.id}/decision`,
      payload: { decision: "approve", reason: "welcome!" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      data: {
        status: "approved",
        tenantId: registrationSample.id,
        ownerUserId: registrationSample.id,
        modules: defaultModules
      }
    });

    expect(hashPassword).toHaveBeenCalledWith("Sup3rSecret!");
    expect(calls.map(({ sql }) => (typeof sql === "string" ? sql.trim() : sql))).toContain("BEGIN");

    const tenantCall = calls.find(({ sql }) => typeof sql === "string" && sql.includes("INSERT INTO tenants"));
    const userCall = calls.find(({ sql }) => typeof sql === "string" && sql.includes("INSERT INTO users"));
    const roleCall = calls.find(({ sql }) => typeof sql === "string" && sql.includes("INSERT INTO roles"));
    const rolePermissionCall = calls.find(({ sql }) => typeof sql === "string" && sql.includes("INSERT INTO role_permissions"));
    const userRoleCall = calls.find(({ sql }) => typeof sql === "string" && sql.includes("INSERT INTO user_roles"));
    const moduleCalls = calls.filter(({ sql }) => typeof sql === "string" && sql.includes("INSERT INTO tenant_modules"));
    const updateCall = calls.find(({ sql }) => typeof sql === "string" && sql.includes("UPDATE tenant_registrations"));
    const commitCall = calls.find(({ sql }) => sql === "COMMIT");

    expect(tenantCall?.params).toEqual([
      registrationSample.id,
      "Nova Eats LLC",
      "nova-eats",
      "America/New_York"
    ]);
    expect(userCall?.params).toEqual([
      registrationSample.id,
      registrationSample.id,
      "owner@nova.test",
      "Nora",
      "Owner",
      JSON.stringify({
        hash: "hashed",
        salt: "salt",
        iterations: 100,
        algorithm: "sha512"
      })
    ]);
    const roleId = roleCall?.params?.[0];
    expect(typeof roleId).toBe("string");
    expect(roleCall?.params?.slice(1)).toEqual([
      registrationSample.id,
      "Business Owner",
      "Default owner role"
    ]);
    expect(rolePermissionCall?.params).toEqual([roleId]);
    expect(userRoleCall?.params).toEqual([registrationSample.id, roleId]);
    expect(moduleCalls).toHaveLength(defaultModules.length);
    expect(moduleCalls.map(({ params }) => params?.[1])).toEqual(defaultModules.map((module) => module.key));
    expect(updateCall?.params).toEqual([
      registrationSample.id,
      "approved",
      "welcome!",
      null,
      registrationSample.id,
      JSON.stringify(defaultModules)
    ]);
    expect(commitCall?.sql).toBe("COMMIT");
  });

  it("rejects a pending registration", async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [registrationSample] })
      .mockResolvedValueOnce({});

    const response = await app.inject({
      method: "POST",
      url: `/superadmin/registrations/${registrationSample.id}/decision`,
      payload: { decision: "reject", reason: "Incomplete information" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ data: { status: "rejected" } });
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE tenant_registrations"),
      [registrationSample.id, "rejected", "Incomplete information", null, null, JSON.stringify(defaultModules)]
    );
  });

  it("updates module presets for pending registration", async () => {
    const updatedModules = [
      { key: "pos", name: "Point of Sale", enabled: true },
      { key: "menu", name: "Menu Manager", enabled: true }
    ];
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [registrationSample] })
      .mockResolvedValueOnce({ rows: [{ modules: updatedModules }] });

    const response = await app.inject({
      method: "PATCH",
      url: `/superadmin/registrations/${registrationSample.id}/modules`,
      payload: { modules: updatedModules }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ data: { modules: updatedModules } });
    expect(client.release).toHaveBeenCalled();
    const auditCall = client.query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO audit_events")
    );
    expect(auditCall?.[1]).toEqual([
      registrationSample.id,
      "user-1",
      "superadmin",
      "registration.module_toggled",
      "tenant_registration",
      registrationSample.id,
      JSON.stringify({ toggles: [{ key: "menu", from: false, to: true }] })
    ]);
  });

  it("rejects module updates when registration is not pending", async () => {
    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...registrationSample, status: "approved" }]
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/superadmin/registrations/${registrationSample.id}/modules`,
      payload: { modules: defaultModules }
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.payload)).toEqual({
      error: {
        code: "CONFLICT",
        message: "Registration already processed"
      }
    });
  });
  it("returns conflict when registration already processed", async () => {
    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...registrationSample, status: "approved" }]
    });

    const response = await app.inject({
      method: "POST",
      url: `/superadmin/registrations/${registrationSample.id}/decision`,
      payload: { decision: "approve" }
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.payload)).toEqual({
      error: {
        code: "CONFLICT",
        message: "Registration already processed"
      }
    });
  });

  it("returns not found when registration id is unknown", async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await app.inject({
      method: "POST",
      url: `/superadmin/registrations/${registrationSample.id}/decision`,
      payload: { decision: "reject" }
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.payload)).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Registration not found"
      }
    });
  });

  it("rolls back when approval pipeline fails", async () => {
    client.query.mockImplementation(async (sql: unknown) => {
      if (typeof sql === "string" && sql.includes("SELECT * FROM tenant_registrations")) {
        return { rowCount: 1, rows: [registrationSample] };
      }
      return {};
    });
    vi.mocked(hashPassword).mockRejectedValueOnce(new Error("hash failure"));

    const response = await app.inject({
      method: "POST",
      url: `/superadmin/registrations/${registrationSample.id}/decision`,
      payload: { decision: "approve" }
    });

    expect(response.statusCode).toBe(500);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("lists registrations filtered by status", async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        {
          id: registrationSample.id,
          status: "pending",
          business: registrationSample.business,
          owner: registrationSample.owner,
          created_at: "2025-10-01T00:00:00Z",
          decided_at: null,
          decision_reason: null,
          tenant_id: null,
          modules: defaultModules
        }
      ]
    });

    const response = await app.inject({
      method: "GET",
      url: "/superadmin/registrations?status=pending&limit=10&offset=5"
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      data: [
        {
          id: registrationSample.id,
          status: "pending",
          business: registrationSample.business,
          owner: registrationSample.owner,
          createdAt: "2025-10-01T00:00:00Z",
          decidedAt: null,
          reason: null,
          tenantId: null,
          modules: defaultModules
        }
      ]
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("FROM tenant_registrations"), [
      "pending",
      10,
      5
    ]);
  });

  it("validates list query parameters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/superadmin/registrations?status=unknown"
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error.code).toBe("VALIDATION");
  });
});








