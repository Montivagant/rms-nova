import { createServer } from "../src/server.js";
import { seedTenantViaApi } from "../../../tests/helpers/tenant.js";
import { truncateAll } from "../../../tests/helpers/db.ts";
import { logger } from "../src/logger.js";

const run = async () => {
  await truncateAll();
  const app = createServer();
  const result = await seedTenantViaApi(app, {
    business: { legalName: "Demo Tenant", doingBusinessAs: "Demo" },
    owner: { email: "demo-owner@example.com" }
  });
  logger.info({ user: result.user }, "Seed tenant created");
  process.exit(0);
};

await run();
