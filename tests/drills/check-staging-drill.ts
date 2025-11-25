#!/usr/bin/env tsx
/**
 * Quick helper to verify the most recent staging drill log is fresh.
 *
 * Usage:
 *   pnpm tsx tests/drills/check-staging-drill.ts
 *
 * The script inspects `tests/drills/logs/staging` for `<timestamp>.md` entries,
 * parses the timestamp (YYYYMMDD-HHmmss), and exits with a non-zero code when the
 * newest log is older than the freshness window (default 7 days).
 */
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.resolve("tests", "drills", "logs", "staging");
const FRESHNESS_DAYS = Number(process.env.DRILL_FRESHNESS_DAYS ?? "7");

const parseTimestamp = (filename: string) => {
  const match = filename.match(/^(\d{8})-(\d{6})\.md$/);
  if (!match) return null;
  const [, datePart, timePart] = match;
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6)) - 1; // JS months are 0-based
  const day = Number(datePart.slice(6, 8));
  const hours = Number(timePart.slice(0, 2));
  const minutes = Number(timePart.slice(2, 4));
  const seconds = Number(timePart.slice(4, 6));
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
};

const main = () => {
  if (!fs.existsSync(LOG_DIR)) {
    console.error(`Log directory not found: ${LOG_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(LOG_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error("No staging drill logs found. Run the drill before proceeding.");
    process.exit(1);
  }

  const latestFile = files[0];
  if (!latestFile) {
    console.error("Unable to determine the latest staging drill log.");
    process.exit(1);
  }
  const timestamp = parseTimestamp(latestFile);
  if (!timestamp) {
    console.error(`Unable to parse timestamp from latest log: ${latestFile}`);
    process.exit(1);
  }

  const now = new Date();
  const ageMs = now.getTime() - timestamp.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  console.log(`Latest staging drill log: ${latestFile} (UTC ${timestamp.toISOString()})`);
  console.log(`Age: ${ageDays.toFixed(2)} day(s)`);

  if (ageDays > FRESHNESS_DAYS) {
    console.error(
      `Latest staging drill log is older than ${FRESHNESS_DAYS} day(s). Re-run the drill ASAP.`
    );
    process.exit(1);
  }

  console.log("Staging drill logs are fresh.");
};

main();
