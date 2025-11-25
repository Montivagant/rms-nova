import { afterEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { createHealthServer } from "../health-server.js";

const createStubLogger = () => ({
  info: vi.fn(),
  error: vi.fn()
});

describe("createHealthServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const listen = async (server: ReturnType<typeof createHealthServer>) => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address && typeof address === "object") {
      return { server, url: `http://127.0.0.1:${address.port}` };
    }
    throw new Error("Failed to acquire listening address");
  };

  it("returns ok for /healthz", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const redis = { ping: vi.fn().mockResolvedValue("PONG") };
    const logger = createStubLogger();
    const server = createHealthServer({ pool, redis, logger });
    const { server: listeningServer, url } = await listen(server);

    const response = await fetch(`${url}/healthz`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ok");

    await new Promise<void>((resolve) => listeningServer.close(() => resolve()));
  });

  it("reports ready when pool and redis succeed", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const redis = { ping: vi.fn().mockResolvedValue("PONG") };
    const logger = createStubLogger();
    const server = createHealthServer({ pool, redis, logger });
    const { server: listeningServer, url } = await listen(server);

    const response = await fetch(`${url}/readyz`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ready");

    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    expect(redis.ping).toHaveBeenCalled();

    await new Promise<void>((resolve) => listeningServer.close(() => resolve()));
  });

  it("reports unready when dependencies fail", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("boom")) };
    const redis = { ping: vi.fn().mockResolvedValue("PONG") };
    const logger = createStubLogger();
    const server = createHealthServer({ pool, redis, logger });
    const { server: listeningServer, url } = await listen(server);

    const response = await fetch(`${url}/readyz`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("unready");
    expect(logger.error).toHaveBeenCalled();

    await new Promise<void>((resolve) => listeningServer.close(() => resolve()));
  });

  it("returns 404 for unknown paths", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const redis = { ping: vi.fn().mockResolvedValue("PONG") };
    const logger = createStubLogger();
    const server = createHealthServer({ pool, redis, logger });
    const { server: listeningServer, url } = await listen(server);

    const response = await fetch(`${url}/unknown`);
    expect(response.status).toBe(404);

    await new Promise<void>((resolve) => listeningServer.close(() => resolve()));
  });
});
