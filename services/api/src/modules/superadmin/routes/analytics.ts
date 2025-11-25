import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../../../db.js";
import { requirePermissions } from "../../../plugins/authorize.js";
import { Errors } from "../../../errors.js";

const toggleAnalyticsQuery = `
  SELECT
    toggle->>'key' AS module_key,
    COUNT(*) FILTER (WHERE (toggle->>'to')::boolean) AS enabled_count,
    COUNT(*) FILTER (WHERE NOT (toggle->>'to')::boolean) AS disabled_count
  FROM audit_events
  CROSS JOIN LATERAL jsonb_array_elements(delta->'toggles') AS toggle
  WHERE module = 'superadmin'
    AND action = 'registration.module_toggled'
    AND created_at >= NOW() - ($1::text || ' days')::interval
    AND jsonb_typeof(delta->'toggles') = 'array'
  GROUP BY module_key
  ORDER BY module_key
`;

export const registerSuperadminAnalyticsRoutes = async (app: FastifyInstance) => {
  app.get(
    "/superadmin/analytics/module-toggles",
    { preHandler: requirePermissions("tenant_registrations.read") },
    async (request) => {
      const parsed = z
        .object({
          windowDays: z.union([z.string(), z.number()]).optional()
        })
        .parse(request.query ?? {});

      const windowDays =
        parsed.windowDays === undefined ? 30 : Number.parseInt(String(parsed.windowDays), 10);

      if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 180) {
        throw Errors.validation("windowDays must be between 1 and 180");
      }

      const client = await pool.connect();
      try {
        const result = await client.query(toggleAnalyticsQuery, [windowDays]);
        return {
          data: {
            windowDays,
            totals: result.rows.map((row) => ({
              module: String(row.module_key),
              enabledCount: Number(row.enabled_count ?? 0),
              disabledCount: Number(row.disabled_count ?? 0)
            }))
          }
        };
      } finally {
        client.release();
      }
    }
  );
};
