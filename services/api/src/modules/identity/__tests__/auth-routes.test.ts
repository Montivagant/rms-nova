import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const mockedPool = vi.hoisted(() => ({
  connect: vi.fn()
}));

vi.mock("../../../db.js", () => ({
  pool: mockedPool
}));

vi.mock("@nova/auth", () => ({
  verifyPassword: vi.fn()
}));

vi.mock("../token-service.js", () => ({
  issueTokens: vi.fn()
}));

const { verifyPassword } = await import("@nova/auth");
const { issueTokens } = await import("../token-service.js");
import { mapErrorToResponse } from "../../../errors.js";
import { registerIdentityRoutes } from "../routes/auth.js";

const parsePayload = (response: { payload: string }) => JSON.parse(response.payload);

type LogErrorParams = Parameters<FastifyInstance["log"]["error"]>;
type LogErrorReturn = ReturnType<FastifyInstance["log"]["error"]>;

describe("registerIdentityRoutes", () => {
  let app: FastifyInstance;
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  let logErrorSpy: MockInstance<LogErrorParams, LogErrorReturn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: { level: "silent" } });
    app.setErrorHandler((error, _request, reply) => {
      const { statusCode, body } = mapErrorToResponse(error);
      void reply.status(statusCode).send(body);
    });

    logErrorSpy = vi.spyOn(app.log, "error").mockImplementation(() => undefined);

    client = {
      query: vi.fn(),
      release: vi.fn()
    };
    mockedPool.connect.mockResolvedValue(client);
    await registerIdentityRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns tokens when credentials are valid", async () => {
    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "user-1",
          tenant_id: "tenant-1",
          email: "user@example.com",
          first_name: "U",
          last_name: "Ser",
          hashed_password: JSON.stringify({ hash: "abc", salt: "salt", iterations: 1, algorithm: "sha512" })
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: "role-1" }] })
      .mockResolvedValueOnce({ rows: [{ permission: "perm:a" }, { permission: "perm:a" }, { permission: "perm:b" }] });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(issueTokens).mockResolvedValue({
      accessToken: "token",
      refreshToken: "refresh",
      refreshTokenId: "id",
      expiresAt: { accessToken: 1, refreshToken: 2 }
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "USER@example.com", password: "supersecret" },
      headers: { "user-agent": "vitest" }
    });

    expect(response.statusCode).toBe(200);
    const payload = parsePayload(response);
    expect(payload.data.user).toMatchObject({
      id: "user-1",
      tenantId: "tenant-1",
      email: "user@example.com",
      roles: ["role-1"],
      permissions: ["perm:a", "perm:b"]
    });
    expect(verifyPassword).toHaveBeenCalledWith("supersecret", expect.any(Object));
    expect(issueTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "user-1",
        tenantId: "tenant-1",
        roles: ["role-1"],
        permissions: ["perm:a", "perm:b"],
        metadata: expect.objectContaining({ user_agent: "vitest" })
      })
    );
    expect(client.release).toHaveBeenCalled();
  });

  it("returns AUTHN when the user is missing", async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "missing@example.com", password: "supersecret" }
    });

    expect(response.statusCode).toBe(401);
    expect(parsePayload(response)).toEqual({
      error: {
        code: "AUTHN",
        message: "Authentication required"
      }
    });
    expect(client.release).toHaveBeenCalled();
  });

  it("returns AUTHN when password verification fails", async () => {
    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "user-1",
          tenant_id: "tenant-1",
          email: "user@example.com",
          first_name: "U",
          last_name: "Ser",
          hashed_password: JSON.stringify({ hash: "abc", salt: "salt", iterations: 1, algorithm: "sha512" })
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "wrongpass" }
    });

    expect(response.statusCode).toBe(401);
    expect(parsePayload(response)).toEqual({
      error: {
        code: "AUTHN",
        message: "Authentication required"
      }
    });
    expect(client.release).toHaveBeenCalled();
  });

  it("returns INTERNAL when stored password is malformed", async () => {
    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "user-1",
        tenant_id: "tenant-1",
        email: "user@example.com",
        first_name: "U",
        last_name: "Ser",
        hashed_password: JSON.stringify({ hash: "abc" })
      }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user@example.com", password: "whateversecret" }
    });

    expect(response.statusCode).toBe(500);
    expect(parsePayload(response)).toEqual({
      error: {
        code: "INTERNAL",
        message: "Unexpected error"
      }
    });
    expect(logErrorSpy).toHaveBeenCalledWith({ userId: "user-1" }, "invalid stored password format");
    expect(client.release).toHaveBeenCalled();
  });
});
