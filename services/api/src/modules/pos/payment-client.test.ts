import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
  NODE_ENV: "test",
  APP_PORT: "3000",
  APP_HOST: "0.0.0.0",
  DATABASE_URL: "postgres://example",
  REDIS_URL: "redis://localhost:6379",
  LOG_LEVEL: "info",
  JWT_SECRET: "x".repeat(32),
  REFRESH_TOKEN_SECRET: "y".repeat(32),
  ACCESS_TOKEN_TTL: "900",
  REFRESH_TOKEN_TTL: "86400",
  PAYMENT_PROVIDER_SANDBOX_BASE_URL: "http://127.0.0.1:4015",
  PAYMENT_PROVIDER_SANDBOX_API_KEY: "sandbox-api-key",
  PAYMENT_PROVIDER_TIMEOUT_MS: "5000"
};

const resetEnv = (overrides: Record<string, string> = {}) => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, baseEnv, overrides);
};

const loadClient = async () => {
  vi.resetModules();
  return import("./payment-client.js");
};

describe("payment-client", () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it("returns completed capture in mock mode", async () => {
    resetEnv({ PAYMENT_PROVIDER_MODE: "mock" });
    const { captureWithProvider } = await loadClient();
    const result = await captureWithProvider({
      tenantId: "t1",
      ticketId: "ticket1",
      paymentId: "pay1",
      amount: 100,
      tipAmount: 10,
      currency: "USD",
      method: "Card",
      locationId: "loc1",
      metadata: {}
    });
    expect(result.processor).toBe("mockpay");
    expect(result.status).toBe("completed");
    expect(result.failureReason).toBeNull();
  });

  it("calls sandbox capture endpoint", async () => {
    resetEnv({
      PAYMENT_PROVIDER_MODE: "sandbox",
      PAYMENT_PROVIDER_SANDBOX_BASE_URL: "http://sandbox.test"
    });
    const mockResponse = {
      processorPaymentId: "sandbox-payment",
      reference: "POS-123",
      status: "pending" as const,
      failureReason: null
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchSpy;
    const { captureWithProvider } = await loadClient();
    const result = await captureWithProvider({
      tenantId: "t1",
      ticketId: "ticket2",
      paymentId: "pay2",
      amount: 50,
      tipAmount: 5,
      currency: "USD",
      method: "Card",
      locationId: "loc1",
      metadata: {}
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://sandbox.test/payments/capture",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.processor).toBe("sandboxpay");
    expect(result.processorPaymentId).toBe("sandbox-payment");
    expect(result.status).toBe("pending");
  });

  it("falls back to simulated sandbox capture when request fails", async () => {
    resetEnv({
      PAYMENT_PROVIDER_MODE: "sandbox",
      PAYMENT_PROVIDER_SANDBOX_OUTCOME: "pending"
    });
    const fetchSpy = vi.fn().mockRejectedValue(new Error("offline"));
    (globalThis as { fetch?: typeof fetch }).fetch = fetchSpy;
    const { captureWithProvider } = await loadClient();
    const result = await captureWithProvider({
      tenantId: "t1",
      ticketId: "ticket2",
      paymentId: "pay2",
      amount: 50,
      tipAmount: 5,
      currency: "USD",
      method: "Card",
      locationId: "loc1",
      metadata: {}
    });
    expect(result.processor).toBe("sandboxpay");
    expect(result.status).toBe("pending");
    expect(result.failureReason).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("calls sandbox refund endpoint", async () => {
    resetEnv({
      PAYMENT_PROVIDER_MODE: "sandbox",
      PAYMENT_PROVIDER_SANDBOX_BASE_URL: "http://sandbox.test"
    });
    const mockResponse = {
      processorRefundId: "sandbox-refund",
      status: "failed" as const,
      failureReason: "Provider declined",
      metadata: { providerCode: "R1" }
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    (globalThis as { fetch?: typeof fetch }).fetch = fetchSpy;
    const { refundWithProvider } = await loadClient();
    const result = await refundWithProvider({
      tenantId: "t1",
      paymentId: "pay3",
      refundId: "ref3",
      amount: 25,
      currency: "USD",
      reason: "test"
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://sandbox.test/payments/pay3/refund",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.processorRefundId).toBe("sandbox-refund");
    expect(result.status).toBe("failed");
    expect(result.failureReason).toBe("Provider declined");
  });
});
