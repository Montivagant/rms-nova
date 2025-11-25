#!/usr/bin/env ts-node
import Fastify from "fastify";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PAYMENT_SANDBOX_PORT ?? "4015");
const HOST = process.env.PAYMENT_SANDBOX_HOST ?? "127.0.0.1";
const AUTH_TOKEN = process.env.PAYMENT_PROVIDER_SANDBOX_API_KEY ?? "sandbox-api-key";
const DEFAULT_OUTCOME = (process.env.PAYMENT_PROVIDER_SANDBOX_OUTCOME ?? "completed").toLowerCase();
const PENDING_FINAL_STATUS = (process.env.PAYMENT_PROVIDER_SANDBOX_PENDING_FINAL_STATUS ?? "completed").toLowerCase();
const SETTLE_DELAY_MS = Number(process.env.PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS ?? "3000");
const WEBHOOK_SECRET = process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET ?? "sandbox-webhook-secret";
const WEBHOOK_BASE_URL = (process.env.PAYMENT_SANDBOX_WEBHOOK_BASE_URL ?? "http://localhost:3000/v1/portal").replace(/\/$/, "");
const RECEIPT_BASE_URL = (process.env.PAYMENT_SANDBOX_RECEIPT_BASE_URL ?? "https://sandboxpay.local/receipts").replace(/\/$/, "");

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info"
  }
});

const resolveOutcome = (override?: string | null) => {
  if (!override) return DEFAULT_OUTCOME;
  return override.toLowerCase() as "completed" | "pending" | "failed";
};

app.addHook("onRequest", (request, reply, done) => {
  const authHeader = request.headers.authorization ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (token !== AUTH_TOKEN) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  done();
});

type CaptureRequestBody = {
  tenantId: string;
  paymentId: string;
  ticketId: string;
  amount: number;
  tipAmount?: number;
  currency: string;
  method: string;
  metadata?: Record<string, unknown>;
  outcome?: "completed" | "pending" | "failed";
};

const sendWebhook = async (payload: {
  paymentId: string;
  tenantId: string;
  status: "completed" | "pending" | "failed";
  failureReason?: string | null;
  processorPaymentId: string;
}) => {
  try {
    await fetch(`${WEBHOOK_BASE_URL}/pos/payments/${payload.paymentId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-provider-secret": WEBHOOK_SECRET
      },
      body: JSON.stringify({
        tenantId: payload.tenantId,
        status: payload.status,
        failureReason: payload.failureReason ?? null,
        processorPaymentId: payload.processorPaymentId
      })
    });
    app.log.info(
      { paymentId: payload.paymentId, status: payload.status },
      "sandbox.webhook.sent"
    );
  } catch (error) {
    app.log.error(
      { err: error, paymentId: payload.paymentId },
      "sandbox.webhook.failed"
    );
  }
};

app.post<{ Body: CaptureRequestBody }>("/payments/capture", async (request, reply) => {
  const body = request.body;
  const outcome = resolveOutcome(body.outcome);
  const processorPaymentId = randomUUID();
  const reference = `sandbox-${Date.now()}`;
  const receiptUrl = `${RECEIPT_BASE_URL}/${body.paymentId}`;

  reply.send({
    processorPaymentId,
    reference,
    receiptUrl,
    status: outcome,
    failureReason: outcome === "failed" ? "Sandbox capture failed" : null,
    metadata: {
      ticketId: body.ticketId,
      currency: body.currency,
      method: body.method,
      amount: body.amount,
      tipAmount: body.tipAmount ?? 0
    }
  });

  if (outcome === "pending") {
    const targetStatus = PENDING_FINAL_STATUS === "failed" ? "failed" : "completed";
    setTimeout(() => {
      void sendWebhook({
        paymentId: body.paymentId,
        tenantId: body.tenantId,
        status: targetStatus as "completed" | "failed",
        failureReason: targetStatus === "failed" ? "Sandbox settlement failed" : null,
        processorPaymentId
      });
    }, SETTLE_DELAY_MS);
  }
});

type RefundRequestBody = {
  tenantId: string;
  paymentId: string;
  refundId: string;
  amount: number;
  currency: string;
  reason?: string | null;
  outcome?: "completed" | "pending" | "failed";
};

app.post<{ Params: { paymentId: string }; Body: RefundRequestBody }>("/payments/:paymentId/refund", async (request, reply) => {
  const body = request.body;
  const outcome = resolveOutcome(body.outcome);
  const processorRefundId = randomUUID();
  reply.send({
    processorRefundId,
    status: outcome,
    failureReason: outcome === "failed" ? "Sandbox refund failed" : null,
    metadata: {
      refundId: body.refundId,
      amount: body.amount,
      currency: body.currency,
      reason: body.reason ?? undefined
    }
  });
});

app.get("/healthz", async () => ({ status: "ok" }));

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(
      {
        port: PORT,
        host: HOST,
        webhookUrl: WEBHOOK_BASE_URL
      },
      "sandbox.provider.started"
    );
  } catch (error) {
    app.log.error({ err: error }, "sandbox.provider.failed_to_start");
    process.exit(1);
  }
};

const shutdown = async () => {
  app.log.info("sandbox.provider.shutdown");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void start();
