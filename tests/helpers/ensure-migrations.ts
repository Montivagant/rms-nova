import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { pool } from "../../services/api/src/db.js";
import { MIGRATION_TABLE, loadMigrations, type Migration } from "../../services/api/scripts/migrations-util.ts";

const ensureMigrationsTable = async (client: PoolClient) => {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
};

const applyMigration = async (client: PoolClient, migration: Migration) => {
  const sql = await readFile(migration.upPath, "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO ${MIGRATION_TABLE} (version, name) VALUES ($1, $2)`,
      [migration.version, migration.name]
    );
    await client.query("COMMIT");
    console.info(`[migrate] Applied ${migration.version}_${migration.name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`[migrate] Failed ${migration.version}_${migration.name}`, error);
    throw error;
  }
};

let migrationsEnsured = false;

export const ensureTestDatabaseMigrated = async () => {
  if (migrationsEnsured || process.env.SKIP_AUTO_MIGRATE === "true") {
    return;
  }

  const migrations = await loadMigrations();
  if (migrations.length === 0) {
    console.warn("[migrate] No migrations found");
    migrationsEnsured = true;
    return;
  }

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const applied = await client.query<{ version: number }>(`SELECT version FROM ${MIGRATION_TABLE}`);
    const appliedVersions = new Set(applied.rows.map((row) => row.version));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await applyMigration(client, migration);
    }
  } finally {
    client.release();
  }

  migrationsEnsured = true;
};
