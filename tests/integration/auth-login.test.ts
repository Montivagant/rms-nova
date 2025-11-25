import { describe, expect, it, beforeEach } from "vitest";
import { createServer } from "../../services/api/src/server.js";
import { truncateAll } from "../helpers/db.js";
import { seedTenantViaApi } from "../helpers/tenant.js";

describe("auth login", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("returns 401 for unknown user", async () => {
    const app = createServer();
    await seedTenantViaApi(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "unknown@example.com",
        password: "password123"
      }
    });
    const body = response.json();
    expect(response.statusCode).toBe(401);
    expect(body.error.code).toBe("AUTHN");
  });
});
