import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../../../db.js";
import { verifyPassword } from "@nova/auth";
import { Errors } from "../../../errors.js";
import { issueTokens } from "../token-service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const storedPasswordSchema = z.object({
  hash: z.string(),
  salt: z.string(),
  iterations: z.number().positive(),
  algorithm: z.literal("sha512")
});

const findUserSql = `
  SELECT id, tenant_id, email, first_name, last_name, hashed_password
  FROM users
  WHERE email = $1
    AND status = 'active'
  LIMIT 1
`;

const userRolesSql = `
  SELECT r.id, r.name
  FROM roles r
  INNER JOIN user_roles ur ON ur.role_id = r.id
  WHERE ur.user_id = $1
`;

const userPermissionsSql = `
  SELECT rp.permission
  FROM role_permissions rp
  INNER JOIN user_roles ur ON ur.role_id = rp.role_id
  WHERE ur.user_id = $1
`;

export const registerIdentityRoutes = async (app: FastifyInstance) => {
  app.post("/auth/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const client = await pool.connect();
    try {
      const res = await client.query(findUserSql, [body.email.toLowerCase()]);
      if (res.rowCount === 0) {
        throw Errors.authn();
      }
      const user = res.rows[0];
      if (!user.hashed_password) {
        throw Errors.authn();
      }
      const parsed = storedPasswordSchema.safeParse(JSON.parse(user.hashed_password));
      if (!parsed.success) {
        app.log.error({ userId: user.id }, "invalid stored password format");
        throw Errors.internal();
      }
      const ok = await verifyPassword(body.password, parsed.data);
      if (!ok) throw Errors.authn();

      const rolesResult = await client.query(userRolesSql, [user.id]);
      const roleIds = rolesResult.rows.map((row: { id: string }) => row.id);
      const permissionsResult = await client.query(userPermissionsSql, [user.id]);
      const permissions = Array.from(
        new Set(
          permissionsResult.rows.map((row: { permission: string }) => String(row.permission))
        )
      );

      const tokens = await issueTokens({
        sub: user.id,
        tenantId: user.tenant_id,
        roles: roleIds,
        permissions,
        metadata: { login_at: new Date().toISOString(), user_agent: request.headers["user-agent"] ?? null }
      });

      return {
        data: {
          user: {
            id: user.id,
            tenantId: user.tenant_id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            roles: roleIds,
            permissions
          },
          tokens
        }
      };
    } finally {
      client.release();
    }
  });
};
