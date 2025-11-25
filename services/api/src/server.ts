import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import underPressure from "@fastify/under-pressure";
import { randomUUID } from "node:crypto";
import { registerHealthRoutes } from "./routes/health.js";
import { logger } from "./logger.js";
import { mapErrorToResponse, NovaError } from "./errors.js";
import { httpRequestHistogram, metricsRegistry } from "./metrics.js";
import { authPlugin } from "./plugins/auth.js";
import { registerIdentityRoutes } from "./modules/identity/routes/auth.js";
import { registerRegistrationRoutes } from "./modules/identity/routes/registration.js";
import { registerRbacRoutes } from "./modules/rbac/routes/roles.js";
import { registerSuperadminAnalyticsRoutes } from "./modules/superadmin/routes/analytics.js";
import { registerSuperadminBillingRoutes } from "./modules/superadmin/routes/billing.js";
import { registerBillingWebhookRoutes } from "./modules/billing/routes/webhooks.js";
import { registerPortalRoutes } from "./modules/portal/routes/index.js";

export const createServer = () => {
  const app = fastify({
    logger
  });

  void app.register(cors, { origin: true });
  void app.register(helmet, { global: true });
  void app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  void app.register(sensible);
  void app.register(underPressure);
  void app.register(authPlugin);

  app.addHook("onRequest", async (request, reply) => {
    const requestId = randomUUID();
    reply.header("x-request-id", requestId);
    request.log.info(
      {
        requestId,
        method: request.method,
        url: request.url
      },
      "request.received"
    );
    (request as typeof request & { metricsStart?: number; requestId?: string }).metricsStart = Date.now();
    (request as typeof request & { metricsStart?: number; requestId?: string }).requestId = requestId;
  });

  app.addHook("onResponse", async (request, reply) => {
    const ctx = request as typeof request & { metricsStart?: number; requestId?: string };
    const metricsStart = ctx.metricsStart;
    const durationSeconds = typeof metricsStart === "number" ? (Date.now() - metricsStart) / 1000 : 0;
    httpRequestHistogram.observe(
      {
        method: request.method,
        route: request.routeOptions?.url ?? request.url,
        status_code: String(reply.statusCode)
      },
      durationSeconds
    );
    request.log.info(
      {
        requestId: ctx.requestId,
        statusCode: reply.statusCode,
        duration_ms: Math.round(durationSeconds * 1000)
      },
      "request.completed"
    );
  });

  void app.setErrorHandler((error, _request, reply) => {
    const response = mapErrorToResponse(error);
    if (!(error instanceof NovaError)) {
      app.log.error({ err: error }, "Unhandled error");
    }
    void reply.status(response.statusCode).send(response.body);
  });

  void app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`
      }
    });
  });

  void app.register(
    async (instance) => {
      await registerHealthRoutes(instance);
      await registerIdentityRoutes(instance);
      await registerRegistrationRoutes(instance);
      await registerRbacRoutes(instance);
      await registerBillingWebhookRoutes(instance);
      await registerSuperadminAnalyticsRoutes(instance);
      await registerSuperadminBillingRoutes(instance);
      await registerPortalRoutes(instance);

      instance.get("/metrics", async (_request, reply) => {
        reply.header("content-type", metricsRegistry.contentType);
        return metricsRegistry.metrics();
      });
    },
    { prefix: "/v1" }
  );

  return app;
};

export type NovaServerInstance = ReturnType<typeof createServer>;
