import { describe, expect, it, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { NovaError } from "../errors.js";

vi.mock("@nova/auth", () => ({
  verifyAccessToken: vi.fn()
}));

vi.mock("../config.js", () => ({
  env: {
    JWT_SECRET: "test-secret"
  }
}));

import { verifyAccessToken } from "@nova/auth";
import { authPlugin } from "../plugins/auth.js";

const getOnRequestHook = async () => {
  const addHook = vi.fn();
  const decorateRequest = vi.fn();
  await authPlugin({
    decorateRequest,
    addHook
  } as unknown as FastifyInstance);

  expect(decorateRequest).toHaveBeenCalledWith("user", null);
  const hookCall = addHook.mock.calls.find(([name]) => name === "onRequest");
  if (!hookCall) {
    throw new Error("onRequest hook was not registered");
  }
  return hookCall[1] as (request: Record<string, unknown>) => Promise<void>;
};

type TokenPayload = Awaited<ReturnType<typeof verifyAccessToken>>;

describe("authPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores requests without an Authorization header", async () => {
    const onRequest = await getOnRequestHook();
    const request: Record<string, unknown> = { headers: {} };

    await expect(onRequest(request)).resolves.toBeUndefined();
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it("throws AUTHN when the authorization header is not bearer", async () => {
    const onRequest = await getOnRequestHook();
    const request = { headers: { authorization: "Token something" } };

    await expect(onRequest(request)).rejects.toMatchObject({
      code: "AUTHN"
    });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("attaches the authenticated user when the token is valid", async () => {
    const onRequest = await getOnRequestHook();
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "user-123",
      tenantId: "tenant-456",
      roles: ["role:a"],
      permissions: ["perm:x", "perm:y"]
    } as TokenPayload);

    const request: Record<string, unknown> = {
      headers: { authorization: "Bearer good-token" }
    };

    await expect(onRequest(request)).resolves.toBeUndefined();
    expect(verifyAccessToken).toHaveBeenCalledWith("good-token", "test-secret");
    expect(request.user).toEqual({
      id: "user-123",
      tenantId: "tenant-456",
      roles: ["role:a"],
      permissions: ["perm:x", "perm:y"]
    });
  });

  it("throws AUTHN when token verification fails or payload missing", async () => {
    const onRequest = await getOnRequestHook();
    vi.mocked(verifyAccessToken).mockResolvedValueOnce({
      sub: null,
      tenantId: "tenant"
    } as unknown as TokenPayload);

    await expect(
      onRequest({
        headers: { authorization: "Bearer incomplete-token" }
      })
    ).rejects.toMatchObject({ code: "AUTHN" });

    vi.mocked(verifyAccessToken).mockRejectedValueOnce(new Error("boom"));
    await expect(
      onRequest({
        headers: { authorization: "Bearer bad-token" }
      })
    ).rejects.toBeInstanceOf(NovaError);
  });
});
