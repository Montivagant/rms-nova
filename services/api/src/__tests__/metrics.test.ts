import { describe, expect, it } from "vitest";
import { httpRequestHistogram, metricsRegistry } from "../metrics.js";

describe("metrics", () => {
  it("registers HTTP request histogram with expected configuration", async () => {
    const histogram = httpRequestHistogram as unknown as { name: string; labelNames: string[] };
    expect(histogram.name).toBe("nova_api_http_request_duration_seconds");
    expect(histogram.labelNames).toEqual(["method", "route", "status_code"]);

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const names = metrics.map((metric) => metric.name);
    expect(names).toContain("nova_api_http_request_duration_seconds");
  });
});
