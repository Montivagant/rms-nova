import { pool } from "../src/db.ts";
import { logger } from "../src/logger.js";

const sql = `
CREATE TABLE IF NOT EXISTS user_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_user ON user_refresh_tokens(user_id, expires_at DESC);
`; 

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query(sql);
    logger.info("Refresh token table ensured");
  } catch (error) {
    logger.error({ err: error }, "Failed to create refresh token table");
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

await run();
