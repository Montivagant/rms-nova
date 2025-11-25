import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { pool } from "../src/db.ts";
import { logger } from "../src/logger.js";
import { loadMigrations, MIGRATION_TABLE, MIGRATIONS_DIR } from "./migrations-util.ts";

const ensureMigrationsTable = async (client: PoolClient) => {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
};

const run = async () => {
  const migrations = await loadMigrations();
  if (migrations.length === 0) {
    logger.warn({ dir: MIGRATIONS_DIR }, "No migrations found");
    return;
  }

  const client: PoolClient = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await client.query<{ version: number }>(`SELECT version FROM ${MIGRATION_TABLE}`);
    const appliedVersions = new Set(applied.rows.map((row: { version: number }) => row.version));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        logger.debug({ version: migration.version, name: migration.name }, "Migration already applied");
        continue;
      }

      const sql = await readFile(migration.upPath, "utf8");
      logger.info({ version: migration.version, name: migration.name }, "Applying migration");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATION_TABLE} (version, name) VALUES ($1, $2)`,
          [migration.version, migration.name]
        );
        await client.query("COMMIT");
        logger.info({ version: migration.version, name: migration.name }, "Applied migration");
      } catch (error) {
        await client.query("ROLLBACK");
        logger.error({ err: error, version: migration.version, name: migration.name }, "Migration failed");
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
};

await run();
