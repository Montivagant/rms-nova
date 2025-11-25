import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../services/api/src/server.js";
import { pool } from "../../services/api/src/db.js";
import { truncateAll } from "../helpers/db.js";
import { seedTenantViaApi } from "../helpers/tenant.js";
import { hashPassword } from "@nova/auth";
import { randomUUID } from "node:crypto";

const createUser = async (tenantId: string, email: string) => {
  const client = await pool.connect();
  const userId = randomUUID();
  try {
    await client.query(
      "INSERT INTO users (id, tenant_id, email, first_name, last_name, status, hashed_password) VALUES ($1, $2, $3, $4, $5, 'active', $6)",
      [userId, tenantId, email.toLowerCase(), "Staff", "Member", JSON.stringify(await hashPassword("Password123!"))]
    );
  } finally {
    client.release();
  }
  return userId;
};

describe("RBAC", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates roles and assigns permissions", async () => {
    const app = createServer();
    const { tokens, user } = await seedTenantViaApi(app);
    const staffUserId = await createUser(user.tenantId, "staff@rbac.test");

    const createRoleResponse = await app.inject({
      method: "POST",
      url: "/v1/rbac/roles",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: "Inventory Manager",
        description: "Manages inventory module",
        permissions: ["inventory.items.read", "inventory.movements.create"]
      }
    });

    expect(createRoleResponse.statusCode).toBe(200);
    const roleId = createRoleResponse.json().data.id;

    const assignResponse = await app.inject({
      method: "POST",
      url: `/v1/rbac/roles/${roleId}/assign`,
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      payload: { userId: staffUserId }
    });
    expect(assignResponse.statusCode).toBe(200);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/rbac/roles",
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    });

    expect(listResponse.statusCode).toBe(200);
    const roles = listResponse.json().data as Array<{ id: string; permissions: string[] }>;
    const created = roles.find((role) => role.id === roleId);
    expect(created).toBeDefined();
    expect(created?.permissions).toContain("inventory.items.read");
  });
});
