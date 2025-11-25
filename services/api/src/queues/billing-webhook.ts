import { Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import type { BillingWebhookJobData } from "@nova/billing";
import { env } from "../config.js";
import { billingWebhookCounter } from "../metrics.js";
import { logger } from "../logger.js";
import { pool } from "../db.js";

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

const connection = createRedisConnection(env.REDIS_URL);

const queueName = env.BILLING_WEBHOOK_QUEUE_NAME;

const knownEventTypes = new Set<BillingWebhookJobData["eventType"]>([
  "subscription.activated",
  "subscription.past_due",
  "subscription.canceled",
  "subscription.plan_changed",
  "invoice.created",
  "invoice.payment_succeeded",
  "invoice.payment_failed"
]);

const queue = new Queue<BillingWebhookJobData>(queueName, {
  connection,
  defaultJobOptions: {
    attempts: env.BILLING_WEBHOOK_MAX_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: env.BILLING_WEBHOOK_BACKOFF_MS
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
});

const queueEvents = new QueueEvents(queueName, { connection });

const requeueDanglingEvents = async () => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: string; event_type: string }>(
      `
        SELECT id, event_type
        FROM billing_webhook_events
        WHERE status = 'failed'
          AND attempts = 0
        ORDER BY created_at ASC
        LIMIT 25
      `
    );

    if (rows.length === 0) {
      return;
    }

    for (const row of rows) {
      if (!knownEventTypes.has(row.event_type as BillingWebhookJobData["eventType"])) {
        logger.warn({ eventId: row.id, eventType: row.event_type }, "billing.webhook.queue.rescue_unknown_type");
        continue;
      }
      const eventType = row.event_type as BillingWebhookJobData["eventType"];
      const existingJob = await queue.getJob(row.id);
      if (existingJob) {
        continue;
      }

      await queue.add("process", { eventId: row.id, eventType }, { jobId: row.id });
      await client.query(
        `
          UPDATE billing_webhook_events
          SET status = 'pending',
              last_error = NULL,
              processed_at = NULL
          WHERE id = $1
        `,
        [row.id]
      );
      billingWebhookCounter.inc({ status: "requeued", event_type: eventType });
    }
  } catch (error) {
    logger.error({ err: error }, "billing.webhook.queue.rescue_failed");
  } finally {
    client.release();
  }
};

let danglingRescueTimer: NodeJS.Timeout | null = null;
const continueRescue = env.NODE_ENV !== "test";
if (continueRescue) {
  const scheduleRescue = () => {
    void requeueDanglingEvents();
  };
  danglingRescueTimer = setInterval(scheduleRescue, env.BILLING_WEBHOOK_REQUEUE_INTERVAL_MS);
  // Run immediately on boot so we don't wait for the first interval.
  scheduleRescue();
}

queueEvents.on("completed", async ({ jobId }) => {
  if (!jobId) return;
  try {
    const job = await queue.getJob(jobId);
    const eventType = job?.data.eventType ?? "unknown";
    billingWebhookCounter.inc({ status: "processed", event_type: eventType });
  } catch (error) {
    logger.error({ err: error, jobId }, "billing.webhook.queue.completed_event_error");
  }
});

queueEvents.on("failed", async ({ jobId }) => {
  if (!jobId) return;
  try {
    const job = await queue.getJob(jobId);
    const eventType = job?.data.eventType ?? "unknown";
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts.attempts ?? env.BILLING_WEBHOOK_MAX_ATTEMPTS;
    const status = attemptsMade >= maxAttempts ? "failed" : "retrying";
    billingWebhookCounter.inc({ status, event_type: eventType });
  } catch (error) {
    logger.error({ err: error, jobId }, "billing.webhook.queue.failed_event_error");
  }
});

queueEvents.on("error", (error) => {
  logger.error({ err: error }, "billing.webhook.queue.events_error");
});

void queueEvents.waitUntilReady().catch((error) => {
  logger.error({ err: error }, "billing.webhook.queue.events_start_error");
});

export const enqueueBillingWebhook = async (job: BillingWebhookJobData) => {
  await queue.add("process", job, { jobId: job.eventId });
  billingWebhookCounter.inc({ status: "queued", event_type: job.eventType });
};

export const closeBillingWebhookQueue = async () => {
  if (danglingRescueTimer) {
    clearInterval(danglingRescueTimer);
  }
  await queueEvents.close();
  await queue.close();
};
