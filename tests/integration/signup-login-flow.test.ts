import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../services/api/src/server.js";
import { truncateAll } from "../helpers/db.js";
import { seedTenantViaApi } from "../helpers/tenant.js";

describe("signup ? approval ? login", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("registers, approves, and logs in a tenant owner", async () => {
    const app = createServer();
    const result = await seedTenantViaApi(app, {
      business: {
        legalName: "Flow Coffee",
        doingBusinessAs: "Flow Coffee"
      },
      owner: {
        email: "flow-owner@test.dev"
      }
    });

    expect(result.user.email).toBe("flow-owner@test.dev");
    expect(result.tokens.accessToken).toBeTypeOf("string");
    expect(result.tokens.refreshToken).toBeTypeOf("string");
  });
});
