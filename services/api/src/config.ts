import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const candidatePaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", ".env"),
  resolve(process.cwd(), "..", "..", ".env")
];

for (const path of candidatePaths) {
  if (existsSync(path)) {
    dotenv.config({ path });
    break;
  }
}

dotenv.config();

const portSchema = z
  .string()
  .default("3000")
  .transform((value) => Number(value))
  .refine((value) => Number.isInteger(value) && value > 0, {
    message: "APP_PORT must be a positive integer"
  });

const numberSchema = (fallback: number) =>
  z
    .string()
    .default(String(fallback))
    .transform((value) => Number(value))
    .refine((value) => Number.isInteger(value) && value > 0, {
      message: "Value must be positive integer"
    });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_PORT: portSchema,
  APP_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  LOG_LEVEL: z.string().default("info"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: numberSchema(900),
  REFRESH_TOKEN_TTL: numberSchema(60 * 60 * 24 * 30),
  BILLING_WEBHOOK_QUEUE_NAME: z.string().default("billing-webhooks"),
  BILLING_WEBHOOK_MAX_ATTEMPTS: numberSchema(5),
  BILLING_WEBHOOK_BACKOFF_MS: numberSchema(5000),
  BILLING_WEBHOOK_REQUEUE_INTERVAL_MS: numberSchema(60_000),
  PAYMENT_STATUS_QUEUE_NAME: z.string().default("payment-status"),
  PAYMENT_STATUS_MAX_ATTEMPTS: numberSchema(5),
  PAYMENT_STATUS_BACKOFF_MS: numberSchema(3000),
  PAYMENT_PROVIDER_MODE: z.enum(["mock", "sandbox", "real_provider"]).default("mock"),
  PAYMENT_PROVIDER_SANDBOX_OUTCOME: z.enum(["completed", "pending", "failed"]).default("completed"),
  PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS: numberSchema(3000),
  PAYMENT_PROVIDER_WEBHOOK_SECRET: z.string().default("sandbox-webhook-secret"),
  PAYMENT_PROVIDER_SANDBOX_BASE_URL: z.string().default("http://127.0.0.1:4015"),
  PAYMENT_PROVIDER_SANDBOX_API_KEY: z.string().default("sandbox-api-key"),
  PAYMENT_PROVIDER_TIMEOUT_MS: numberSchema(5000),
  PAYMENT_PROVIDER_BASE_URL: z.string().default(""),
  PAYMENT_PROVIDER_API_KEY: z.string().default("")
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
};

export const env = parseEnv();
export type Env = typeof env;
