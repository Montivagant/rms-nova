import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../services/api/src/server.js";
import { pool } from "../../services/api/src/db.js";
import { truncateAll } from "../helpers/db.js";
import { seedTenantViaApi } from "../helpers/tenant.js";
import { makeSuperadminAuthHeader } from "../helpers/superadmin.js";

describe("registration flow", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("allows registration and approval to create tenant + owner", async () => {
    const app = createServer();
    const result = await seedTenantViaApi(app);

    const client = await pool.connect();
    try {
      const tenantResult = await client.query("SELECT * FROM tenants");
      expect(tenantResult.rowCount).toBe(1);
      const userResult = await client.query("SELECT * FROM users");
      expect(userResult.rowCount).toBe(1);
      const refreshResult = await client.query("SELECT count(*)::int AS count FROM user_refresh_tokens WHERE user_id = $1", [result.user.id]);
      expect(refreshResult.rows[0].count).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });

  it("rejects a registration", async () => {
    const app = createServer();
    const registrationResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        business: {
          legalName: "Reject Corp",
          doingBusinessAs: "Reject",
          contactEmail: "reject@corp.test",
          contactPhone: "+123456780",
          country: "US",
          timezone: "UTC"
        },
        owner: {
          firstName: "Rick",
          lastName: "Jones",
          email: "reject@corp.test",
          password: "Password123!"
        }
      }
    });
    const registrationId = registrationResponse.json().data.registrationId;

    const rejection = await app.inject({
      method: "POST",
      url: `/v1/superadmin/registrations/${registrationId}/decision`,
      headers: {
        authorization: await makeSuperadminAuthHeader()
      },
      payload: { decision: "reject", reason: "Incomplete docs" }
    });

    expect(rejection.statusCode).toBe(200);
    const client = await pool.connect();
    try {
      const reg = await client.query("SELECT status, decision_reason FROM tenant_registrations WHERE id = $1", [registrationId]);
      expect(reg.rows[0].status).toBe("rejected");
      expect(reg.rows[0].decision_reason).toBe("Incomplete docs");
      const tenants = await client.query("SELECT count(*)::int AS count FROM tenants");
      expect(tenants.rows[0].count).toBe(0);
    } finally {
      client.release();
    }
  });
});
