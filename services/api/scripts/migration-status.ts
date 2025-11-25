import { table } from "node:console";
import { pool } from "../src/db.ts";
import { logger } from "../src/logger.js";
import { loadMigrations, MIGRATION_TABLE } from "./migrations-util.ts";

const ensureMigrationsTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
};

const run = async () => {
  const migrations = await loadMigrations();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable();
    const applied = await client.query<{ version: number; applied_at: Date }>(
      `SELECT version, applied_at FROM ${MIGRATION_TABLE} ORDER BY version`
    );
    const appliedVersions = new Map(applied.rows.map((row) => [row.version, row.applied_at]));

    const rows = migrations.map((migration) => ({
      version: migration.version,
      name: migration.name,
      status: appliedVersions.has(migration.version) ? "applied" : "pending",
      applied_at: appliedVersions.get(migration.version)?.toISOString() ?? "-"
    }));

    if (rows.length === 0) {
      logger.info("No migrations found in db/migrations");
      return;
    }

    table(rows);
  } finally {
    client.release();
    await pool.end();
  }
};

await run().catch((error) => {
  logger.error({ err: error }, "migration.status.failed");
  process.exitCode = 1;
});
