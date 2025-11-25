import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { pool } from "../src/db.ts";
import { logger } from "../src/logger.js";

type Migration = {
  version: number;
  name: string;
  upPath: string;
  downPath?: string;
};

const MIGRATIONS_DIR = resolve(process.cwd(), "..", "..", "db", "migrations");
const MIGRATION_TABLE = "schema_migrations";

const loadMigrations = async (): Promise<Map<number, Migration>> => {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const map = new Map<number, Migration>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".up.sql")) continue;

    const match = entry.name.match(/^(\d+)_([\w-]+)\.up\.sql$/i);
    if (!match) {
      throw new Error(`Invalid migration filename: ${entry.name}`);
    }

    const [, versionStr, name] = match;
    const version = Number.parseInt(versionStr, 10);
    const upPath = resolve(MIGRATIONS_DIR, entry.name);
    const downFilename = `${versionStr}_${name}.down.sql`;
    const downPath = entries.some((item) => item.name === downFilename)
      ? resolve(MIGRATIONS_DIR, downFilename)
      : undefined;

    map.set(version, { version, name, upPath, downPath });
  }

  return map;
};

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
  const client: PoolClient = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const latest = await client.query<{ version: number; name: string }>(
      `SELECT version, name FROM ${MIGRATION_TABLE} ORDER BY version DESC LIMIT 1`
    );

    if (latest.rowCount === 0) {
      logger.info("No migrations to roll back");
      return;
    }

    const { version, name } = latest.rows[0];
    const migration = migrations.get(version);
    if (!migration) {
      throw new Error(`Migration metadata missing for version ${version}`);
    }
    if (!migration.downPath) {
      throw new Error(`No down migration found for ${version}_${migration.name}`);
    }

    const sql = await readFile(migration.downPath, "utf8");
    logger.warn({ version, name: migration.name }, "Rolling back migration");

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`DELETE FROM ${MIGRATION_TABLE} WHERE version = $1`, [version]);
      await client.query("COMMIT");
      logger.info({ version, name: migration.name }, "Rolled back migration");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error({ err: error, version, name: migration.name }, "Rollback failed");
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
};

await run();
