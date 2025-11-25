import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerHealthRoutes } from "../health.js";

describe("health routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await registerHealthRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns ok status with ISO timestamp for /health", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe("ok");
    expect(typeof payload.timestamp).toBe("string");
    expect(() => new Date(payload.timestamp).toISOString()).not.toThrow();
  });

  it("reports readiness on /ready", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ status: "ready" });
  });
});
