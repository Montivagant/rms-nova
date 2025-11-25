import { pool } from "../src/db.ts";
import { logger } from "../src/logger.js";

const run = async () => {
  try {
    const result = await pool.query("SELECT 1 as ok");
    logger.info({ result: result.rows[0] }, "Database reachable");
  } catch (error) {
    logger.error({ err: error }, "Database connection failed");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

await run();
