import { describe, it, expect } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requirePermissions } from "../plugins/authorize.js";

type RequestLike = FastifyRequest & { user?: unknown };

const buildRequest = (user?: Record<string, unknown>) => {
  return {
    user,
    headers: {}
  } as unknown as RequestLike;
};

const reply = {} as FastifyReply;

describe("requirePermissions", () => {
  it("throws AUTHN when request has no user context", async () => {
    const handler = requirePermissions("perm:read");

    await expect(handler(buildRequest(), reply)).rejects.toMatchObject({ code: "AUTHN" });
  });

  it("throws AUTHZ when user lacks any required permission", async () => {
    const handler = requirePermissions("perm:read", "perm:write");
    const user = {
      id: "user-1",
      tenantId: "tenant-1",
      roles: ["role:basic"],
      permissions: ["perm:read"]
    };

    await expect(handler(buildRequest(user), reply)).rejects.toMatchObject({ code: "AUTHZ" });
  });

  it("allows the request when permissions satisfy the requirements", async () => {
    const handler = requirePermissions("perm:read");
    const user = {
      id: "user-1",
      tenantId: "tenant-1",
      roles: ["role:basic"],
      permissions: ["perm:read", "perm:write"]
    };

    await expect(handler(buildRequest(user), reply)).resolves.toBeUndefined();
  });

  it("accepts wildcard permission", async () => {
    const handler = requirePermissions("perm:manage");
    const user = {
      id: "admin",
      tenantId: "tenant-1",
      roles: ["role:admin"],
      permissions: ["*"]
    };

    await expect(handler(buildRequest(user), reply)).resolves.toBeUndefined();
  });
});
