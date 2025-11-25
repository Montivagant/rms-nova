import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool } from "../../../db.js";
import { hashPassword } from "@nova/auth";
import { Errors } from "../../../errors.js";
import { requirePermissions } from "../../../plugins/authorize.js";
import { registrationModuleDefaults } from "@nova/module-registry";

const isUndefinedTableError = (error: unknown): error is { code?: string } =>
  Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01");

type RegistrationStatus = "pending" | "approved" | "rejected";
import { moduleToggleCounter } from "../../../metrics.js";

const registrationSchema = z.object({
  business: z.object({
    legalName: z.string().min(2),
    doingBusinessAs: z.string().min(2),
    contactEmail: z.string().email(),
    contactPhone: z.string().min(7),
    country: z.string().min(2),
    timezone: z.string().min(2)
  }),
  owner: z.object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8)
  })
});

const moduleToggleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  category: z.string().optional()
});

type ModuleToggle = z.infer<typeof moduleToggleSchema>;

type ToggleChange = {
  key: string;
  from: boolean;
  to: boolean;
};

const diffModuleToggles = (previous: ModuleToggle[], next: ModuleToggle[]): ToggleChange[] => {
  const previousByKey = new Map(previous.map((module) => [module.key, module]));
  return next
    .map((module) => {
      const before = previousByKey.get(module.key);
      return {
        key: module.key,
        from: before?.enabled ?? false,
        to: module.enabled
      };
    })
    .filter((change) => change.from !== change.to);
};

const recordModuleToggleTelemetry = async (
  client: PoolClient,
  options: {
    tenantId: string;
    userId: string | null | undefined;
    entityType: string;
    entityId: string;
    toggles: ToggleChange[];
    log: FastifyBaseLogger;
  }
) => {
  const { tenantId, userId, entityType, entityId, toggles, log } = options;
  if (toggles.length === 0) return;

  await client.query(
    `
      INSERT INTO audit_events (tenant_id, user_id, module, action, entity_type, entity_id, delta)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      tenantId,
      userId ?? null,
      "superadmin",
      "registration.module_toggled",
      entityType,
      entityId,
      JSON.stringify({ toggles })
    ]
  );

  for (const toggle of toggles) {
    moduleToggleCounter.inc({
      module: toggle.key,
      enabled: toggle.to ? "true" : "false"
    });
  }

  log.info(
    {
      tenantId,
      entityType,
      entityId,
      toggles
    },
    "superadmin.module_toggles.updated"
  );
};

const approveSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
  modules: z.array(moduleToggleSchema).optional()
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

const parseListQuery = (query: unknown) => {
  const result = listQuerySchema.safeParse(query);
  if (!result.success) {
    throw Errors.validation("Invalid query parameters", result.error.flatten().fieldErrors);
  }
  return result.data;
};

const insertRegistrationSql = `
  INSERT INTO tenant_registrations (business, owner, modules)
  VALUES ($1, $2, $3)
  RETURNING id
`;

const selectRegistrationSql = `
  SELECT * FROM tenant_registrations WHERE id = $1
`;

const updateRegistrationSql = `
  UPDATE tenant_registrations
  SET status = $2, decided_at = NOW(), decision_reason = $3, decided_by = $4, tenant_id = $5, modules = $6
  WHERE id = $1
`;

const updateModulesSql = `
  UPDATE tenant_registrations
  SET modules = $2
  WHERE id = $1
  RETURNING modules
`;

const sanitizeModuleToggles = (modules: unknown): ModuleToggle[] => {
  const result = z.array(moduleToggleSchema).safeParse(modules);
  if (!result.success) {
    return registrationModuleDefaults.map((module) => ({ ...module }));
  }
  const overrides = new Map(result.data.map((module) => [module.key, module]));
  const merged = registrationModuleDefaults.map((module) => {
    const override = overrides.get(module.key);
    if (!override) return { ...module };
    overrides.delete(module.key);
    return {
      key: module.key,
      name: override.name ?? module.name,
      enabled: override.enabled,
      category: override.category ?? module.category
    };
  });
  for (const leftover of overrides.values()) {
    merged.push({ ...leftover });
  }
  return merged;
};

const ensureRegistrationTablePromise = (async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_registrations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        business JSONB NOT NULL,
        owner JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decision_reason TEXT,
        decided_at TIMESTAMPTZ,
        decided_by UUID,
        tenant_id UUID,
        modules JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_tenant_registrations_status ON tenant_registrations(status, created_at);

      ALTER TABLE tenant_registrations ADD COLUMN IF NOT EXISTS tenant_id UUID;
      ALTER TABLE tenant_registrations ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '[]';
    `);
  } finally {
    client.release();
  }
})();

export const registerRegistrationRoutes = async (app: FastifyInstance) => {
  await ensureRegistrationTablePromise;

  app.post("/auth/register", async (request) => {
    const body = registrationSchema.parse(request.body);
    const client = await pool.connect();
    try {
      const result = await client.query(insertRegistrationSql, [
        body.business,
        body.owner,
        JSON.stringify(registrationModuleDefaults)
      ]);
      return { data: { registrationId: result.rows[0].id } };
    } finally {
      client.release();
    }
  });

  app.get(
    "/superadmin/registrations",
    { preHandler: requirePermissions("tenant_registrations.read") },
    async (request) => {
      const query = parseListQuery(request.query);
      const client = await pool.connect();
      try {
        const results = await client.query(
          `
          SELECT id, status, business, owner, created_at, decided_at, decision_reason, modules, tenant_id
          FROM tenant_registrations
          WHERE ($1::text IS NULL OR status = $1)
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3
        `,
          [query.status ?? null, query.limit, query.offset]
        );
        return {
          data: results.rows.map(
            (row: {
              id: string;
              status: RegistrationStatus;
              business: Record<string, unknown>;
              owner: Record<string, unknown>;
              created_at: string;
              decided_at: string | null;
              decision_reason: string | null;
              tenant_id: string | null;
              modules?: unknown;
            }) => ({
              id: row.id,
              status: row.status,
              business: row.business,
              owner: row.owner,
              createdAt: row.created_at,
              decidedAt: row.decided_at,
              reason: row.decision_reason,
              tenantId: row.tenant_id,
              modules: sanitizeModuleToggles(row.modules)
            })
          )
        };
      } finally {
        client.release();
      }
    }
  );

  app.patch(
    "/superadmin/registrations/:id/modules",
    { preHandler: requirePermissions("tenant_registrations.approve") },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({ modules: z.array(moduleToggleSchema) }).parse(request.body);
      const client = await pool.connect();
      try {
        const regResult = await client.query(selectRegistrationSql, [params.id]);
        if (regResult.rowCount === 0) {
          throw Errors.notFound("Registration not found");
        }
        const registration = regResult.rows[0];
        if (registration.status !== "pending") {
          throw Errors.conflict("Registration already processed");
        }
        const previous = sanitizeModuleToggles(registration.modules);
        const normalized = sanitizeModuleToggles(body.modules);
        const toggles = diffModuleToggles(previous, normalized);
        const updated = await client.query(updateModulesSql, [params.id, JSON.stringify(normalized)]);
        const tenantId = registration.tenant_id ?? params.id;
        await recordModuleToggleTelemetry(client, {
          tenantId,
          userId: request.user?.id ?? null,
          entityType: "tenant_registration",
          entityId: params.id,
          toggles,
          log: request.log
        });
        return { data: { modules: updated.rows[0].modules } };
      } finally {
        client.release();
      }
    }
  );

  app.post(
    "/superadmin/registrations/:id/decision",
    { preHandler: requirePermissions("tenant_registrations.approve") },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = approveSchema.parse(request.body);

      const client = await pool.connect();
      try {
        const regResult = await client.query(selectRegistrationSql, [params.id]);
        if (regResult.rowCount === 0) {
          throw Errors.notFound("Registration not found");
        }
        const registration = regResult.rows[0];
        if (registration.status !== "pending") {
          throw Errors.conflict("Registration already processed");
        }

        const previousModules = sanitizeModuleToggles(registration.modules);
        const modules = sanitizeModuleToggles(body.modules ?? registration.modules);
        const toggles = diffModuleToggles(previousModules, modules);

        if (body.decision === "reject") {
          await client.query(updateRegistrationSql, [
            params.id,
            "rejected",
            body.reason ?? null,
            null,
            registration.tenant_id ?? null,
            JSON.stringify(modules)
          ]);
          const tenantId = registration.tenant_id ?? params.id;
          await recordModuleToggleTelemetry(client, {
            tenantId,
            userId: request.user?.id ?? null,
            entityType: "tenant_registration",
            entityId: params.id,
            toggles,
            log: request.log
          });
          return { data: { status: "rejected" } };
        }

        const tenantId: string = registration.tenant_id ?? registration.business.tenantId ?? registration.id;
        const tenantAlias =
          (registration.business.doingBusinessAs as string)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 32) || `tenant-${registration.id.slice(0, 8)}`;
        const userId: string = registration.owner.userId ?? registration.id;
        const hashed = await hashPassword(registration.owner.password);

        await client.query("BEGIN");
        await client.query(
          "INSERT INTO tenants (id, name, alias, status, timezone) VALUES ($1, $2, $3, 'active', $4)",
          [tenantId, registration.business.legalName, tenantAlias, registration.business.timezone]
        );
        await client.query(
          "INSERT INTO users (id, tenant_id, email, first_name, last_name, status, hashed_password) VALUES ($1, $2, $3, $4, $5, 'active', $6)",
          [
            userId,
            tenantId,
            (registration.owner.email as string).toLowerCase(),
            registration.owner.firstName,
            registration.owner.lastName,
            JSON.stringify(hashed)
          ]
        );
        await client.query("SAVEPOINT business_profile_insert");
        try {
          await client.query(
            `
            INSERT INTO tenant_business_profiles (
              tenant_id,
              legal_name,
              doing_business_as,
              support_email,
              support_phone,
              website,
              timezone,
              notes
            )
            VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL)
            ON CONFLICT (tenant_id) DO NOTHING
            `,
            [
              tenantId,
              registration.business.legalName,
              registration.business.doingBusinessAs ?? registration.business.legalName,
              registration.business.contactEmail ?? null,
              registration.business.contactPhone ?? null,
              registration.business.timezone ?? "UTC"
            ]
          );
          await client.query("RELEASE SAVEPOINT business_profile_insert");
        } catch (error) {
          if (!isUndefinedTableError(error)) {
            throw error;
          }
          await client.query("ROLLBACK TO SAVEPOINT business_profile_insert");
          request.log.warn({ err: error, tenantId }, "tenant_business_profiles table missing; skipping profile insert");
        }
        const ownerRoleId = randomUUID();
        await client.query(
          "INSERT INTO roles (id, tenant_id, name, description, is_system) VALUES ($1, $2, $3, $4, true)",
          [ownerRoleId, tenantId, "Business Owner", "Default owner role"]
        );
        await client.query("INSERT INTO role_permissions (role_id, permission) VALUES ($1, '*')", [ownerRoleId]);
        await client.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [userId, ownerRoleId]);

        for (const module of modules) {
          await client.query(
            `
            INSERT INTO tenant_modules (tenant_id, module_id, enabled, source, updated_by)
            VALUES ($1, $2, $3, 'superadmin', $4)
            ON CONFLICT (tenant_id, module_id)
            DO UPDATE SET enabled = EXCLUDED.enabled, source = EXCLUDED.source, updated_by = EXCLUDED.updated_by, updated_at = NOW()
          `,
            [tenantId, module.key, module.enabled, userId]
          );
        }

        await client.query(updateRegistrationSql, [
          params.id,
          "approved",
          body.reason ?? null,
          null,
          tenantId,
          JSON.stringify(modules)
        ]);
        await recordModuleToggleTelemetry(client, {
          tenantId,
          userId: request.user?.id ?? null,
          entityType: "tenant",
          entityId: tenantId,
          toggles,
          log: request.log
        });
        await client.query("COMMIT");

      return {
        data: {
          status: "approved",
          tenantId,
          ownerUserId: userId,
          modules
        }
      };
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error }, "superadmin.registration.decision.failed");
      throw error;
    } finally {
      client.release();
    }
    }
  );
};



