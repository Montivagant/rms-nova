import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolMock = vi.hoisted(() => ({
  connect: vi.fn()
}));

const moduleRegistryMock = vi.hoisted(() => ({
  loadRegistry: vi.fn(() => ({ modules: [], default_roles: [] })),
  listPermissions: vi.fn(() => [
    "rbac.roles.create",
    "rbac.roles.read",
    "rbac.roles.update",
    "rbac.roles.delete",
    "rbac.roles.assign"
  ]),
  registrationModuleDefaults: []
}));

vi.mock("../../../db.js", () => ({
  pool: poolMock
}));

vi.mock("@nova/module-registry", () => ({
  loadRegistry: moduleRegistryMock.loadRegistry,
  listPermissions: moduleRegistryMock.listPermissions,
  registrationModuleDefaults: moduleRegistryMock.registrationModuleDefaults
}));

const { registerRbacRoutes } = await import("../routes/roles.js");
const { mapErrorToResponse } = await import("../../../errors.js");

const tenantUser = {
  id: "user-1",
  tenantId: "tenant-1",
  roles: ["role-owner"],
  permissions: ["rbac.roles.create", "rbac.roles.read", "rbac.roles.assign", "*"]
};

const createApp = async () => {
  const app = Fastify({ logger: { level: "silent" } });
  app.decorateRequest("user", null);
  app.addHook("onRequest", (request, _reply, done) => {
    request.user = tenantUser;
    done();
  });
  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = mapErrorToResponse(error);
    void reply.status(statusCode).send(body);
  });
  await registerRbacRoutes(app);
  return app;
};

describe("rbac role routes", () => {
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

  it("creates roles with provided permissions", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "role-123" }] }) // role insert
      .mockResolvedValue({}); // permission inserts + release

    const payload = {
      name: "Managers",
      description: "Manager role",
      permissions: ["rbac.roles.read", "rbac.roles.assign"]
    };

    const response = await app.inject({
      method: "POST",
      url: "/rbac/roles",
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      data: {
        id: "role-123",
        name: "Managers",
        description: "Manager role",
        permissions: ["rbac.roles.read", "rbac.roles.assign"]
      }
    });
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("INSERT INTO roles"),
      [tenantUser.tenantId, "Managers", "Manager role"]
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO role_permissions"),
      ["role-123", "rbac.roles.read"]
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO role_permissions"),
      ["role-123", "rbac.roles.assign"]
    );
    expect(client.release).toHaveBeenCalled();
  });

  it("rejects unknown permissions when creating role", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rbac/roles",
      payload: {
        name: "Invalid",
        description: "Invalid role",
        permissions: ["not.real.permission"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toEqual({
      error: {
        code: "VALIDATION",
        message: "Unknown permissions",
        details: { invalid: ["not.real.permission"] }
      }
    });
  });

  it("lists roles with aggregated permissions", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [
          { id: "role-1", name: "Managers", description: "Manager role" },
          { id: "role-2", name: "Viewers", description: null }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { role_id: "role-1", permission: "rbac.roles.read" },
          { role_id: "role-1", permission: "rbac.roles.assign" }
        ]
      });

    const response = await app.inject({
      method: "GET",
      url: "/rbac/roles"
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      data: [
        {
          id: "role-1",
          name: "Managers",
          description: "Manager role",
          permissions: ["rbac.roles.read", "rbac.roles.assign"]
        },
        {
          id: "role-2",
          name: "Viewers",
          description: null,
          permissions: []
        }
      ]
    });

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT id, name, description FROM roles"),
      [tenantUser.tenantId]
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SELECT role_id, permission FROM role_permissions"),
      [["role-1", "role-2"]]
    );
    expect(client.release).toHaveBeenCalled();
  });

  it("assigns role to user", async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "role-1" }] })
      .mockResolvedValueOnce({});

    const response = await app.inject({
      method: "POST",
      url: "/rbac/roles/22222222-2222-2222-2222-222222222222/assign",
      payload: { userId: "33333333-3333-3333-3333-333333333333" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      data: {
        roleId: "22222222-2222-2222-2222-222222222222",
        userId: "33333333-3333-3333-3333-333333333333"
      }
    });
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO user_roles"),
      ["33333333-3333-3333-3333-333333333333", "22222222-2222-2222-2222-222222222222"]
    );
  });

  it("returns not found when assigning unknown role", async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/rbac/roles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/assign",
      payload: { userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.payload)).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Role not found"
      }
    });
  });
});
