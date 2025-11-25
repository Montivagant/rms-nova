import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Migration = {
  version: number;
  name: string;
  upPath: string;
  downPath?: string;
};

const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = resolve(scriptsDir, "../../..", "db", "migrations");
export const MIGRATION_TABLE = "schema_migrations";

export const loadMigrations = async (): Promise<Migration[]> => {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations: Migration[] = [];

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

    migrations.push({ version, name, upPath, downPath });
  }

  return migrations.sort((a, b) => a.version - b.version);
};
