import { describe, expect, it } from "vitest";
import { createServer } from "../../services/api/src/server.js";

describe("health routes", () => {
  it("returns ok status", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.status).toBe("ok");
  });
});
