import { afterEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const endMock = vi.fn();
const poolStub = { connect: connectMock, end: endMock };

vi.mock("pg", () => ({
  Pool: vi.fn(() => poolStub)
}));

vi.mock("../config.js", () => ({
  env: {
    DATABASE_URL: "postgres://example",
    NODE_ENV: "test"
  }
}));

describe("db pool", () => {
  afterEach(() => {
    connectMock.mockReset();
    endMock.mockReset();
    vi.resetModules();
  });

  it("creates a pool with configured connection string", async () => {
    const { pool } = await import("../db.js");
    expect(pool).toBe(poolStub);
    const { Pool } = await import("pg");
    expect(Pool).toHaveBeenCalledWith({
      connectionString: "postgres://example",
      max: 10,
      idleTimeoutMillis: 10_000
    });
  });

  it("closes the pool when closePool is invoked", async () => {
    const { closePool } = await import("../db.js");
    await closePool();
    expect(endMock).toHaveBeenCalled();
  });
});
