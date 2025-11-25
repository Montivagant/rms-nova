#!/usr/bin/env tsx
import fs from "node:fs";
import { Client } from "pg";

type ModuleRow = {
  module_id: string;
  enabled: boolean;
  source?: string;
};

type FeatureFlagRow = {
  module_id: string;
  feature_key: string;
  enabled: boolean;
  overridden: boolean;
};

type DrillConfig = {
  DATABASE_URL?: string;
  API_URL?: string;
  BILLING_WEBHOOK_SECRET?: string;
  DRILL_TENANT_ID?: string;
  DRILL_SUBSCRIPTION_ID?: string;
  DRILL_PLAN_ID_TARGET?: string;
  DRILL_PLAN_ID_SOURCE?: string;
  DRILL_BILLING_CYCLE?: string;
};

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Env file not found at ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"));
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

const loadJsonConfig = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found at ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as DrillConfig;
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && !process.env[key]) {
      process.env[key] = value;
    }
  }
};

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--env-file" || arg === "-e") {
    const file = args[i + 1];
    if (!file) throw new Error("--env-file flag requires a path");
    loadEnvFile(file);
    i += 1;
  } else if (arg === "--config" || arg === "-c") {
    const file = args[i + 1];
    if (!file) throw new Error("--config flag requires a path");
    loadJsonConfig(file);
    i += 1;
  }
}

const {
  DATABASE_URL,
  API_URL,
  BILLING_WEBHOOK_SECRET,
  DRILL_TENANT_ID,
  DRILL_SUBSCRIPTION_ID,
  DRILL_PLAN_ID_TARGET = "1ef168c5-66e9-4d11-8f51-32301dbce0d4",
  DRILL_PLAN_ID_SOURCE = "7f4c6d3f-7de2-4ba1-92a7-9baf0e3a8ed1",
  DRILL_BILLING_CYCLE = "monthly"
} = process.env as DrillConfig;

const requiredEnv = {
  DATABASE_URL,
  API_URL,
  BILLING_WEBHOOK_SECRET,
  DRILL_TENANT_ID,
  DRILL_SUBSCRIPTION_ID
};

const missing = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(
      ", "
    )}. Please export them before running this drill.`
  );
  process.exit(1);
}

const prettyJSON = (value: unknown) => JSON.stringify(value, null, 2);

const postWebhook = async (payload: unknown) => {
  const response = await fetch(`${API_URL}/billing/webhooks/sandbox`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sandbox-signature": BILLING_WEBHOOK_SECRET ?? ""
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook call failed (${response.status}): ${body}`);
  }

  return response.json();
};

const queryState = async (client: Client) => {
  const modulesResult = await client.query<ModuleRow>(
    `
      SELECT module_id, enabled, source
      FROM tenant_modules
      WHERE tenant_id = $1
      ORDER BY module_id
    `,
    [DRILL_TENANT_ID]
  );

  const featuresResult = await client.query<FeatureFlagRow>(
    `
      SELECT module_id, feature_key, enabled, overridden
      FROM tenant_feature_flags
      WHERE tenant_id = $1
      ORDER BY module_id, feature_key
    `,
    [DRILL_TENANT_ID]
  );

  const auditsResult = await client.query(
    `
      SELECT created_at, action, entity_type, entity_id
      FROM audit_events
      WHERE tenant_id = $1 AND module = 'billing'
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [DRILL_TENANT_ID]
  );

  return {
    modules: modulesResult.rows,
    featureFlags: featuresResult.rows,
    audits: auditsResult.rows
  };
};

const logState = (label: string, state: Awaited<ReturnType<typeof queryState>>) => {
  console.log(`\n=== ${label} ===`);
  console.log("Plan modules:");
  console.table(
    state.modules.map((row) => ({
      module: row.module_id,
      enabled: row.enabled,
      source: row.source
    }))
  );
  console.log("Plan feature flags:");
  if (state.featureFlags.length === 0) {
    console.log("(none)");
  } else {
    console.table(
      state.featureFlags.map((row) => ({
        module: row.module_id,
        feature: row.feature_key,
        enabled: row.enabled,
        overridden: row.overridden
      }))
    );
  }
  console.log("Recent billing audit events:");
  console.log(prettyJSON(state.audits));
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log("Starting billing plan entitlement drill.");
    console.log(
      `Tenant ${DRILL_TENANT_ID} subscription ${DRILL_SUBSCRIPTION_ID} | swap plan ${DRILL_PLAN_ID_SOURCE} -> ${DRILL_PLAN_ID_TARGET}`
    );

    const baseline = await queryState(client);
    logState("Baseline", baseline);

    console.log("\nPosting subscription.plan_changed webhook...");
    await postWebhook({
      type: "subscription.plan_changed",
      data: {
        subscriptionId: DRILL_SUBSCRIPTION_ID,
        tenantId: DRILL_TENANT_ID,
        planId: DRILL_PLAN_ID_TARGET,
        billingCycle: DRILL_BILLING_CYCLE
      }
    });
    await sleep(2000);
    const afterPlanChange = await queryState(client);
    logState("After plan change", afterPlanChange);

    console.log("\nPosting subscription.canceled webhook...");
    await postWebhook({
      type: "subscription.canceled",
      data: {
        subscriptionId: DRILL_SUBSCRIPTION_ID,
        cancelAtPeriodEnd: true
      }
    });
    await sleep(2000);
    const afterCancellation = await queryState(client);
    logState("After cancellation", afterCancellation);

    console.log("\nDrill complete. Review output and dashboards for alerts/metrics.");
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error("Drill failed:", error);
  process.exit(1);
});
