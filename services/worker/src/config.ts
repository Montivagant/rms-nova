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
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BILLING_WEBHOOK_QUEUE_NAME: z.string().default("billing-webhooks"),
  BILLING_WEBHOOK_MAX_ATTEMPTS: numberSchema(5),
  WORKER_HEALTH_PORT: numberSchema(3001),
  WORKER_HEALTH_HOST: z.string().default("0.0.0.0"),
  PAYMENT_PROVIDER_MODE: z.enum(["mock", "sandbox"]).default("mock"),
  PAYMENT_PROVIDER_SANDBOX_OUTCOME: z.enum(["completed", "pending", "failed"]).default("completed"),
  PAYMENT_PROVIDER_SANDBOX_SETTLE_DELAY_MS: numberSchema(3000)
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
