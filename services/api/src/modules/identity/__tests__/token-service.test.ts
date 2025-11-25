import { describe, expect, it, beforeEach, afterEach, vi, type MockInstance } from "vitest";

const mocks = vi.hoisted(() => ({
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  createAccessTokenMock: vi.fn(),
  createRefreshTokenMock: vi.fn(),
  hashTokenMock: vi.fn()
}));

vi.mock("../../../db.js", () => ({
  pool: {
    connect: mocks.connectMock
  }
}));

vi.mock("../../../config.js", () => ({
  env: {
    JWT_SECRET: "jwt-secret",
    REFRESH_TOKEN_SECRET: "refresh-secret",
    ACCESS_TOKEN_TTL: 900,
    REFRESH_TOKEN_TTL: 7200
  }
}));

vi.mock("@nova/auth", async () => {
  const actual = await vi.importActual<typeof import("@nova/auth")>("@nova/auth");
  return {
    ...actual,
    createAccessToken: mocks.createAccessTokenMock,
    createRefreshToken: mocks.createRefreshTokenMock,
    hashToken: mocks.hashTokenMock
  };
});

import { issueTokens } from "../token-service.js";

const {
  connectMock,
  queryMock,
  releaseMock,
  createAccessTokenMock,
  createRefreshTokenMock,
  hashTokenMock
} = mocks;

describe("issueTokens", () => {
  let dateSpy: MockInstance<[], number>;

  beforeEach(() => {
    vi.clearAllMocks();
    const client = { query: queryMock, release: releaseMock };
    connectMock.mockResolvedValue(client);
    createAccessTokenMock.mockResolvedValue("access-token");
    createRefreshTokenMock.mockResolvedValue("refresh-token");
    hashTokenMock.mockReturnValue("hashed-refresh");
    queryMock.mockResolvedValue({ rows: [{ id: "row-id" }] });
    releaseMock.mockResolvedValue(undefined);
    dateSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it("creates access/refresh tokens and persists hashed refresh token", async () => {
    const result = await issueTokens({
      sub: "user-1",
      tenantId: "tenant-9",
      roles: ["role:member"],
      permissions: ["perm:read"],
      metadata: { ip: "127.0.0.1" }
    });

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(createAccessTokenMock).toHaveBeenCalledWith(
      {
        sub: "user-1",
        tenantId: "tenant-9",
        roles: ["role:member"],
        permissions: ["perm:read"]
      },
      "jwt-secret",
      900
    );

    expect(createRefreshTokenMock).toHaveBeenCalledTimes(1);
    const [refreshClaims, refreshSecret, refreshTtl] = createRefreshTokenMock.mock.calls[0];
    expect(refreshClaims).toMatchObject({ sub: "user-1", tenantId: "tenant-9" });
    expect(typeof refreshClaims.tokenId).toBe("string");
    expect(refreshSecret).toBe("refresh-secret");
    expect(refreshTtl).toBe(7200);
    expect(hashTokenMock).toHaveBeenCalledWith("refresh-token");

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [, params] = queryMock.mock.calls[0];
    const expectedAccessExpiry = Math.floor(1_700_000_000_000 / 1000) + 900;
    const expectedRefreshExpiry = Math.floor(1_700_000_000_000 / 1000) + 7200;

    expect(params).toEqual([
      "tenant-9",
      "user-1",
      "hashed-refresh",
      new Date(expectedRefreshExpiry * 1000),
      { ip: "127.0.0.1" }
    ]);

    expect(releaseMock).toHaveBeenCalled();
    expect(result.refreshTokenId).toBe(refreshClaims.tokenId);
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      refreshTokenId: refreshClaims.tokenId,
      expiresAt: {
        accessToken: expectedAccessExpiry,
        refreshToken: expectedRefreshExpiry
      }
    });
  });
});
