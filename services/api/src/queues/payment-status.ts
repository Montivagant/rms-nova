import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "../config.js";
import { logger } from "../logger.js";

export type PaymentStatusJobData = {
  tenantId: string;
  paymentId: string;
  ticketId: string;
  processedBy?: string | null;
  targetStatus?: "completed" | "failed";
};

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
const queue = new Queue<PaymentStatusJobData>(env.PAYMENT_STATUS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: env.PAYMENT_STATUS_MAX_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: env.PAYMENT_STATUS_BACKOFF_MS
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
});

export const enqueuePaymentStatusJob = async (
  job: PaymentStatusJobData,
  options?: { delayMs?: number }
) => {
  const delay = options?.delayMs ?? env.PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS;
  const targetStatus = job.targetStatus ?? env.PAYMENT_PROVIDER_SANDBOX_OUTCOME;
  await queue.add("settle", { ...job, targetStatus }, { jobId: job.paymentId, delay });
  logger.info({ paymentId: job.paymentId, tenantId: job.tenantId, delay }, "payment.status_job.enqueued");
};

export const closePaymentStatusQueue = async () => {
  await queue.close();
};
