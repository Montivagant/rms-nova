import { Pool } from "pg";
import { env } from "./config.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 10_000
});

export const withConnection = async <T>(fn: (client: Pool) => Promise<T>) => fn(pool);

export const closePool = async () => {
  await pool.end();
};
