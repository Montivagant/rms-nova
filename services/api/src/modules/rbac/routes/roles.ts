import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../../../db.js";
import { requirePermissions } from "../../../plugins/authorize.js";
import { AccessTokenClaims } from "@nova/auth";
import { loadRegistry } from "@nova/module-registry";
import { Errors } from "../../../errors.js";
import { listPermissions } from "@nova/module-registry";

const createRoleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  permissions: z.array(z.string()).nonempty()
});

const assignSchema = z.object({
  userId: z.string().uuid()
});

const loadedRegistry = loadRegistry();
const validPermissions = new Set(listPermissions());
validPermissions.add("*");

const ensurePermissionsValid = (permissions: string[]) => {
  const invalid = permissions.filter((permission) => !validPermissions.has(permission));
  if (invalid.length > 0) {
    throw Errors.validation("Unknown permissions", { invalid });
  }
};

export const registerRbacRoutes = async (app: FastifyInstance) => {
  app.post(
    "/rbac/roles",
    { preHandler: requirePermissions("rbac.roles.create") },
    async (request) => {
      if (!request.user) throw Errors.authn();
      const body = createRoleSchema.parse(request.body);
      ensurePermissionsValid(body.permissions);

      const client = await pool.connect();
      try {
        const roleResult = await client.query(
          "INSERT INTO roles (tenant_id, name, description, is_system) VALUES ($1, $2, $3, false) RETURNING id",
          [request.user.tenantId, body.name, body.description ?? null]
        );
        const roleId = roleResult.rows[0].id as string;
        for (const permission of body.permissions) {
          await client.query("INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)", [roleId, permission]);
        }
        return {
          data: {
            id: roleId,
            name: body.name,
            description: body.description,
            permissions: body.permissions
          }
        };
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/rbac/roles",
    { preHandler: requirePermissions("rbac.roles.read") },
    async (request) => {
      if (!request.user) throw Errors.authn();
      const client = await pool.connect();
      try {
        const roles = await client.query(
          "SELECT id, name, description FROM roles WHERE tenant_id = $1 ORDER BY name",
          [request.user.tenantId]
        );
        const permissionsResponse = await client.query(
          "SELECT role_id, permission FROM role_permissions WHERE role_id = ANY($1)",
          [roles.rows.map((row) => row.id)]
        );
        const permissionMap = new Map<string, string[]>();
        for (const row of permissionsResponse.rows) {
          const roleId = row.role_id as string;
          const permList = permissionMap.get(roleId) ?? [];
          permList.push(row.permission as string);
          permissionMap.set(roleId, permList);
        }
        return {
          data: roles.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            permissions: permissionMap.get(row.id) ?? []
          }))
        };
      } finally {
        client.release();
      }
    }
  );

  app.post(
    "/rbac/roles/:roleId/assign",
    { preHandler: requirePermissions("rbac.roles.assign") },
    async (request) => {
      if (!request.user) throw Errors.authn();
      const params = z.object({ roleId: z.string().uuid() }).parse(request.params);
      const body = assignSchema.parse(request.body);

      const client = await pool.connect();
      try {
        const roleCheck = await client.query(
          "SELECT id FROM roles WHERE id = $1 AND tenant_id = $2",
          [params.roleId, request.user.tenantId]
        );
        if (roleCheck.rowCount === 0) {
          throw Errors.notFound("Role not found");
        }
        await client.query(
          "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [body.userId, params.roleId]
        );
        return { data: { roleId: params.roleId, userId: body.userId } };
      } finally {
        client.release();
      }
    }
  );
};

