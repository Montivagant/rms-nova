import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn()
  }
}));

const originalExit = process.exit;
const originalEnv = { ...process.env };

const mergeEnv = (values: Record<string, string | undefined>) => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") {
      process.env[key] = value;
    }
  }
};

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    mergeEnv(originalEnv);
  });

  afterEach(() => {
    process.exit = originalExit;
    mergeEnv(originalEnv);
  });

  it("parses environment variables and exposes typed config", async () => {
    mergeEnv({
      NODE_ENV: "test",
      APP_PORT: "4000",
      APP_HOST: "127.0.0.1",
      DATABASE_URL: "postgres://example",
      LOG_LEVEL: "debug",
      JWT_SECRET: "x".repeat(32),
      REFRESH_TOKEN_SECRET: "y".repeat(32),
      ACCESS_TOKEN_TTL: "1200",
      REFRESH_TOKEN_TTL: "86400"
    });

    const { env } = await import("../config.js");

    expect(env).toMatchObject({
      NODE_ENV: "test",
      APP_PORT: 4000,
      APP_HOST: "127.0.0.1",
      DATABASE_URL: "postgres://example",
      LOG_LEVEL: "debug",
      ACCESS_TOKEN_TTL: 1200,
      REFRESH_TOKEN_TTL: 86400
    });
  });

  it("exits process when configuration is invalid", async () => {
    mergeEnv({ DATABASE_URL: "" });
    await expect(import("../config.js")).rejects.toMatchObject({
      issues: expect.any(Array)
    });
  });
});
