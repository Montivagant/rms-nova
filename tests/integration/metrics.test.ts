import { describe, expect, it } from "vitest";
import { createServer } from "../../services/api/src/server.js";

describe("metrics route", () => {
  it("serves prometheus metrics", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/v1/metrics" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("# HELP nova_api_http_request_duration_seconds");
  });
});
