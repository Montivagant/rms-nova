import { Worker, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import { Pool } from "pg";
import {
  applyBillingWebhookEvent,
  billingWebhookEventSchema,
  type BillingWebhookJobData
} from "@nova/billing";
import { env } from "./config.js";
import { logger } from "./logger.js";
import { createHealthServer } from "./health-server.js";

const pool = new Pool({
  connectionString: env.DATABASE_URL
});

const redis = new Redis(env.REDIS_URL);
redis.on("error", (error) => {
  logger.error({ err: error }, "billing.webhook.worker.redis_error");
});

const createRedisConnection = (redisUrl: string): ConnectionOptions => {
  const url = new URL(redisUrl);
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username || undefined,
    password: url.password || undefined
  };
  if (url.pathname && url.pathname !== "/") {
    const db = Number(url.pathname.replace("/", ""));
    if (!Number.isNaN(db)) connection.db = db;
  }
  if (url.protocol === "rediss:") {
    connection.tls = {};
  }
  return connection;
};

const redisConnection = createRedisConnection(env.REDIS_URL);

const worker = new Worker<BillingWebhookJobData>(
  env.BILLING_WEBHOOK_QUEUE_NAME,
  async (job) => {
    const { eventId } = job.data;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<{ payload: unknown }>(
        `
          SELECT payload
          FROM billing_webhook_events
          WHERE id = $1
          FOR UPDATE
        `,
        [eventId]
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        logger.warn({ eventId }, "billing.webhook.worker.event_missing");
        return { status: "missing" as const };
      }

      const event = billingWebhookEventSchema.parse(result.rows[0]?.payload);
      await applyBillingWebhookEvent(client, event, logger);

      await client.query(
        `
          UPDATE billing_webhook_events
          SET status = 'processed',
              attempts = attempts + 1,
              processed_at = NOW(),
              last_error = NULL
          WHERE id = $1
        `,
        [eventId]
      );

      await client.query("COMMIT");
      logger.info({ eventId, eventType: event.type }, "billing.webhook.worker.processed");
      return { status: "processed" as const, eventType: event.type };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback errors
      }
      const message = error instanceof Error ? error.message : String(error);
      const attemptsMade = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? env.BILLING_WEBHOOK_MAX_ATTEMPTS;
      const status = attemptsMade >= maxAttempts ? "failed" : "pending";

      await client.query(
        `
          UPDATE billing_webhook_events
          SET status = $2,
              attempts = attempts + 1,
              processed_at = NOW(),
              last_error = $3
          WHERE id = $1
        `,
        [eventId, status, message]
      );

      logger.error({ err: error, eventId, attemptsMade }, "billing.webhook.worker.failed");
      throw error;
    } finally {
      client.release();
    }
  },
  {
    connection: redisConnection,
    concurrency: 5
  }
);

type PaymentStatusJobData = {
  tenantId: string;
  paymentId: string;
  ticketId: string;
  processedBy?: string | null;
  targetStatus?: "completed" | "failed";
};

const paymentStatusWorker = new Worker<PaymentStatusJobData>(
  env.PAYMENT_STATUS_QUEUE_NAME,
  async (job) => {
    const { tenantId, paymentId, ticketId, processedBy, targetStatus } = job.data;
    const status =
      targetStatus ?? (env.PAYMENT_PROVIDER_SANDBOX_OUTCOME === "failed" ? "failed" : "completed");
    const failureReason = status === "failed" ? "Sandbox settlement failed" : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          UPDATE pos_payments
          SET
            status = $1,
            failure_reason = $2,
            captured_at = CASE WHEN $1 = 'completed' THEN COALESCE(captured_at, NOW()) ELSE captured_at END
          WHERE tenant_id = $3 AND id = $4
        `,
        [status, failureReason, tenantId, paymentId]
      );

      if (status === "completed") {
        await client.query(
          `
            UPDATE pos_tickets
            SET status = 'settled',
                closed_by = COALESCE(closed_by, $3),
                closed_at = COALESCE(closed_at, NOW())
            WHERE tenant_id = $1 AND id = $2
          `,
          [tenantId, ticketId, processedBy ?? null]
        );
      }

      await client.query("COMMIT");
      logger.info({ tenantId, paymentId, status }, "payment.status_job.processed");
      return { status };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      logger.warn(
        { err: error, tenantId, paymentId, status },
        "payment.status_job.failed"
      );
      throw error;
    } finally {
      client.release();
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

worker.on("error", (error) => {
  logger.error({ err: error }, "billing.webhook.worker.error");
});
paymentStatusWorker.on("error", (error) => {
  logger.error({ err: error }, "payment.status_job.error");
});

const healthServer = createHealthServer({ pool, redis, logger });

const settlePendingSandboxPayments = async () => {
  if (env.PAYMENT_PROVIDER_MODE !== "sandbox") return;
  const delayMs = env.PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS;
  const targetStatus = env.PAYMENT_PROVIDER_SANDBOX_OUTCOME === "failed" ? "failed" : "completed";

  const client = await pool.connect();
  try {
    const pending = await client.query<{
      id: string;
      tenant_id: string;
      ticket_id: string;
      processed_by: string | null;
    }>(
      `
        SELECT id, tenant_id, ticket_id, processed_by
        FROM pos_payments
        WHERE status = 'pending'
          AND (processor = 'sandboxpay' OR processor IS NULL)
          AND created_at <= NOW() - ($1::int || ' milliseconds')::interval
        LIMIT 50
      `,
      [delayMs]
    );

    if (pending.rowCount === 0) {
      return;
    }

    for (const row of pending.rows) {
      await client.query("BEGIN");
      try {
        await client.query(
          `
            UPDATE pos_payments
            SET
              status = $1,
              failure_reason = CASE WHEN $1 = 'failed' THEN 'Sandbox settlement failed' ELSE NULL END,
              captured_at = CASE WHEN $1 = 'completed' THEN COALESCE(captured_at, NOW()) ELSE captured_at END
            WHERE tenant_id = $2 AND id = $3
          `,
          [targetStatus, row.tenant_id, row.id]
        );

        if (targetStatus === "completed") {
          await client.query(
            `
              UPDATE pos_tickets
              SET status = 'settled',
                  closed_by = COALESCE(closed_by, $3),
                  closed_at = COALESCE(closed_at, NOW())
              WHERE tenant_id = $1 AND id = $2
            `,
            [row.tenant_id, row.ticket_id, row.processed_by]
          );
        }

        await client.query("COMMIT");
        logger.info(
          { paymentId: row.id, tenantId: row.tenant_id, status: targetStatus },
          "payment.sandbox.auto_settle"
        );
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        logger.warn(
          { err: error, paymentId: row.id, tenantId: row.tenant_id },
          "payment.sandbox.auto_settle_failed"
        );
      }
    }
  } finally {
    client.release();
  }
};

const startSandboxSettlementLoop = () => {
  if (env.PAYMENT_PROVIDER_MODE !== "sandbox") return;
  const intervalMs = Math.max(env.PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS, 1000);
  // Kick once on startup then loop
  void settlePendingSandboxPayments().catch((error) =>
    logger.warn({ err: error }, "payment.sandbox.auto_settle_start_failed")
  );
  return setInterval(() => {
    void settlePendingSandboxPayments().catch((error) =>
      logger.warn({ err: error }, "payment.sandbox.auto_settle_tick_failed")
    );
  }, intervalMs);
};

const sandboxSettleTimer = startSandboxSettlementLoop();

healthServer.listen(env.WORKER_HEALTH_PORT, env.WORKER_HEALTH_HOST, () => {
  logger.info(
    { port: env.WORKER_HEALTH_PORT, host: env.WORKER_HEALTH_HOST },
    "billing.webhook.worker.health_server.started"
  );
});

const shutdown = async () => {
  logger.info("billing.webhook.worker.shutdown");
  await worker.close();
  await paymentStatusWorker.close();
  await pool.end();
  await redis
    .quit()
    .catch((error) => logger.warn({ err: error }, "billing.webhook.worker.redis_quit_failed"));
  if (sandboxSettleTimer) {
    clearInterval(sandboxSettleTimer);
  }
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

logger.info({ queue: env.BILLING_WEBHOOK_QUEUE_NAME }, "billing.webhook.worker.started");
