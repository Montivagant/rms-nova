import { randomUUID } from "node:crypto";
import { env } from "../../config.js";
import { logger } from "../../logger.js";

export type ProviderCaptureRequest = {
  tenantId: string;
  ticketId: string;
  paymentId: string;
  amount: number;
  tipAmount: number;
  currency: string;
  method: string;
  locationId: string;
  metadata: Record<string, unknown>;
};

export type ProviderCaptureResult = {
  processor: string;
  processorPaymentId: string;
  reference: string;
  methodType?: string;
  methodBrand?: string;
  methodLast4?: string;
  receiptUrl?: string;
  metadata?: Record<string, unknown>;
  status: "completed" | "pending" | "failed";
  failureReason?: string | null;
};

export type ProviderRefundRequest = {
  tenantId: string;
  paymentId: string;
  refundId: string;
  amount: number;
  currency: string;
  reason?: string | null;
};

export type ProviderRefundResult = {
  processor: string;
  processorRefundId: string;
  metadata?: Record<string, unknown>;
  status: "completed" | "pending" | "failed";
  failureReason?: string | null;
};

const SANDBOX_OUTCOME = env.PAYMENT_PROVIDER_SANDBOX_OUTCOME.toLowerCase();
const PROVIDER_MODE = env.PAYMENT_PROVIDER_MODE.toLowerCase();
const SANDBOX_BASE_URL = env.PAYMENT_PROVIDER_SANDBOX_BASE_URL.replace(/\/$/, "");
const SANDBOX_API_KEY = env.PAYMENT_PROVIDER_SANDBOX_API_KEY;
const REAL_BASE_URL = env.PAYMENT_PROVIDER_BASE_URL?.replace(/\/$/, "") ?? "";
const REAL_API_KEY = env.PAYMENT_PROVIDER_API_KEY;
const REQUEST_TIMEOUT_MS = env.PAYMENT_PROVIDER_TIMEOUT_MS;

const buildReceiptUrl = (provider: string, tenantId: string, id: string) =>
  `https://${provider}.local/receipts/${tenantId}/${id}`;

const defaultMetadata = (request: ProviderCaptureRequest) => ({
  ticketId: request.ticketId,
  locationId: request.locationId,
  currency: request.currency,
  ...request.metadata
});

const mockCapture = (request: ProviderCaptureRequest): ProviderCaptureResult => {
  return {
    processor: "mockpay",
    processorPaymentId: `mockpay_${randomUUID()}`,
    reference: `POS-${Date.now()}`,
    methodType: request.method,
    methodBrand: String(request.metadata?.methodBrand ?? "Visa"),
    methodLast4: String(request.metadata?.methodLast4 ?? "4242"),
    receiptUrl: buildReceiptUrl("mockpay", request.tenantId, request.paymentId),
    metadata: defaultMetadata(request),
    status: "completed",
    failureReason: null
  };
};

const mockRefund = (request: ProviderRefundRequest): ProviderRefundResult => {
  return {
    processor: "mockpay",
    processorRefundId: `mockpay_ref_${randomUUID()}`,
    metadata: {
      paymentId: request.paymentId,
      refundId: request.refundId,
      amount: request.amount,
      currency: request.currency,
      reason: request.reason ?? undefined
    },
    status: "completed",
    failureReason: null
  };
};

const simulateSandboxCapture = (request: ProviderCaptureRequest): ProviderCaptureResult => {
  const base = mockCapture(request);
  const processorPaymentId = `sandbox_${randomUUID()}`;
  const receiptUrl = buildReceiptUrl("sandboxpay", request.tenantId, request.paymentId);

  if (SANDBOX_OUTCOME === "pending") {
    return {
      ...base,
      processor: "sandboxpay",
      processorPaymentId,
      receiptUrl,
      status: "pending",
      failureReason: null
    };
  }
  if (SANDBOX_OUTCOME === "failed") {
    return {
      ...base,
      processor: "sandboxpay",
      processorPaymentId,
      receiptUrl,
      status: "failed",
      failureReason: "Sandbox capture failed"
    };
  }
  return {
    ...base,
    processor: "sandboxpay",
    processorPaymentId,
    receiptUrl,
    status: "completed",
    failureReason: null
  };
};

const simulateSandboxRefund = (request: ProviderRefundRequest): ProviderRefundResult => {
  const base = mockRefund(request);
  const processorRefundId = `sandbox_ref_${randomUUID()}`;
  if (SANDBOX_OUTCOME === "pending") {
    return {
      ...base,
      processor: "sandboxpay",
      processorRefundId,
      status: "pending",
      failureReason: null
    };
  }
  if (SANDBOX_OUTCOME === "failed") {
    return {
      ...base,
      processor: "sandboxpay",
      processorRefundId,
      status: "failed",
      failureReason: "Sandbox refund failed"
    };
  }
  return {
    ...base,
    processor: "sandboxpay",
    processorRefundId,
    status: "completed",
    failureReason: null
  };
};

type SandboxCaptureResponse = {
  processorPaymentId: string;
  reference: string;
  receiptUrl?: string;
  metadata?: Record<string, unknown>;
  status: "completed" | "pending" | "failed";
  failureReason?: string | null;
  methodType?: string;
  methodBrand?: string;
  methodLast4?: string;
};

type SandboxRefundResponse = {
  processorRefundId: string;
  status: "completed" | "pending" | "failed";
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
};

type RealCaptureResponse = {
  processor?: string;
  processorPaymentId: string;
  reference: string;
  receiptUrl?: string;
  metadata?: Record<string, unknown>;
  status: "completed" | "pending" | "failed";
  failureReason?: string | null;
  methodType?: string;
  methodBrand?: string;
  methodLast4?: string;
};

type RealRefundResponse = {
  processor?: string;
  processorRefundId: string;
  status: "completed" | "pending" | "failed";
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
};

const requestSandbox = async <T>(path: string, payload: unknown): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SANDBOX_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SANDBOX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `Sandbox provider error (${response.status} ${response.statusText}): ${message || "unknown"}`
      );
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

const sandboxCapture = async (request: ProviderCaptureRequest): Promise<ProviderCaptureResult> => {
  try {
    const response = await requestSandbox<SandboxCaptureResponse>("/payments/capture", {
      tenantId: request.tenantId,
      paymentId: request.paymentId,
      ticketId: request.ticketId,
      amount: request.amount,
      tipAmount: request.tipAmount,
      currency: request.currency,
      method: request.method,
      metadata: request.metadata
    });
    return {
      processor: "sandboxpay",
      processorPaymentId: response.processorPaymentId,
      reference: response.reference,
      methodType: response.methodType ?? request.method,
      methodBrand: response.methodBrand ?? String(request.metadata?.methodBrand ?? "Visa"),
      methodLast4: response.methodLast4 ?? String(request.metadata?.methodLast4 ?? "4242"),
      receiptUrl: response.receiptUrl ?? buildReceiptUrl("sandboxpay", request.tenantId, request.paymentId),
      metadata: response.metadata ?? defaultMetadata(request),
      status: response.status,
      failureReason: response.failureReason ?? null
    };
  } catch (error) {
    logger.warn({ err: error }, "payment.provider.sandbox.capture_fallback");
    return simulateSandboxCapture(request);
  }
};

const sandboxRefund = async (request: ProviderRefundRequest): Promise<ProviderRefundResult> => {
  try {
    const response = await requestSandbox<SandboxRefundResponse>(`/payments/${request.paymentId}/refund`, {
      tenantId: request.tenantId,
      paymentId: request.paymentId,
      refundId: request.refundId,
      amount: request.amount,
      currency: request.currency,
      reason: request.reason ?? null
    });
    return {
      processor: "sandboxpay",
      processorRefundId: response.processorRefundId,
      metadata: response.metadata ?? {
        paymentId: request.paymentId,
        refundId: request.refundId,
        amount: request.amount,
        currency: request.currency,
        reason: request.reason ?? undefined
      },
      status: response.status,
      failureReason: response.failureReason ?? null
    };
  } catch (error) {
    logger.warn({ err: error }, "payment.provider.sandbox.refund_fallback");
    return simulateSandboxRefund(request);
  }
};

const ensureRealProviderConfig = () => {
  if (!REAL_BASE_URL) {
    throw new Error("PAYMENT_PROVIDER_BASE_URL is required when PAYMENT_PROVIDER_MODE=real_provider");
  }
  if (!REAL_API_KEY) {
    throw new Error("PAYMENT_PROVIDER_API_KEY is required when PAYMENT_PROVIDER_MODE=real_provider");
  }
};

const requestRealProvider = async <T>(path: string, payload: unknown): Promise<T> => {
  ensureRealProviderConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${REAL_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `Provider error (${response.status} ${response.statusText}): ${message || "unknown"}`
      );
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

const realCapture = async (request: ProviderCaptureRequest): Promise<ProviderCaptureResult> => {
  try {
    const response = await requestRealProvider<RealCaptureResponse>("/payments/capture", {
      tenantId: request.tenantId,
      paymentId: request.paymentId,
      ticketId: request.ticketId,
      amount: request.amount,
      tipAmount: request.tipAmount,
      currency: request.currency,
      method: request.method,
      metadata: request.metadata
    });
    return {
      processor: response.processor ?? "provider",
      processorPaymentId: response.processorPaymentId,
      reference: response.reference,
      methodType: response.methodType ?? request.method,
      methodBrand: response.methodBrand ?? String(request.metadata?.methodBrand ?? "Visa"),
      methodLast4: response.methodLast4 ?? String(request.metadata?.methodLast4 ?? "4242"),
      receiptUrl: response.receiptUrl ?? buildReceiptUrl("provider", request.tenantId, request.paymentId),
      metadata: response.metadata ?? defaultMetadata(request),
      status: response.status,
      failureReason: response.failureReason ?? null
    };
  } catch (error) {
    logger.warn({ err: error }, "payment.provider.real.capture_fallback");
    return simulateSandboxCapture(request);
  }
};

const realRefund = async (request: ProviderRefundRequest): Promise<ProviderRefundResult> => {
  try {
    const response = await requestRealProvider<RealRefundResponse>(`/payments/${request.paymentId}/refund`, {
      tenantId: request.tenantId,
      paymentId: request.paymentId,
      refundId: request.refundId,
      amount: request.amount,
      currency: request.currency,
      reason: request.reason ?? null
    });
    return {
      processor: response.processor ?? "provider",
      processorRefundId: response.processorRefundId,
      metadata: response.metadata ?? {
        paymentId: request.paymentId,
        refundId: request.refundId,
        amount: request.amount,
        currency: request.currency,
        reason: request.reason ?? undefined
      },
      status: response.status,
      failureReason: response.failureReason ?? null
    };
  } catch (error) {
    logger.warn({ err: error }, "payment.provider.real.refund_fallback");
    return simulateSandboxRefund(request);
  }
};

export const captureWithProvider = async (
  request: ProviderCaptureRequest
): Promise<ProviderCaptureResult> => {
  if (PROVIDER_MODE === "sandbox") {
    return sandboxCapture(request);
  }
  if (PROVIDER_MODE === "real_provider") {
    return realCapture(request);
  }
  return mockCapture(request);
};

export const refundWithProvider = async (
  request: ProviderRefundRequest
): Promise<ProviderRefundResult> => {
  if (PROVIDER_MODE === "sandbox") {
    return sandboxRefund(request);
  }
  if (PROVIDER_MODE === "real_provider") {
    return realRefund(request);
  }
  return mockRefund(request);
};
