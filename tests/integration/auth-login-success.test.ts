import { describe, expect, it, beforeEach } from "vitest";
import { createServer } from "../../services/api/src/server.js";
import { truncateAll } from "../helpers/db.js";
import { seedTenantViaApi } from "../helpers/tenant.js";

describe("auth login success", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns tokens for valid credentials", async () => {
    const app = createServer();
    const { user, tokens } = await seedTenantViaApi(app);

    expect(tokens.accessToken).toBeTypeOf("string");
    expect(tokens.refreshToken).toBeTypeOf("string");
    expect(user.email).toBe("owner@nova.test");
  });
});
