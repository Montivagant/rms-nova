import { createServer, type ServerResponse } from "node:http";
import type { Pool } from "pg";
import type Redis from "ioredis";

export type HealthServerDeps = {
  pool: Pick<Pool, "query">;
  redis: Pick<Redis, "ping">;
  logger: {
    info: (payload: unknown, message?: string) => void;
    error: (payload: unknown, message?: string) => void;
  };
};

const respond = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

export const createHealthServer = ({ pool, redis, logger }: HealthServerDeps) => {
  const server = createServer((req, res) => {
    (async () => {
      if (!req.url) {
        respond(res, 404, { status: "not_found" });
        return;
      }

      if (req.method !== "GET") {
        respond(res, 405, { status: "method_not_allowed" });
        return;
      }

      const url = new URL(req.url, "http://health.local");
      const path = url.pathname;

      if (path === "/healthz") {
        respond(res, 200, { status: "ok" });
        return;
      }

      if (path === "/readyz") {
        try {
          await Promise.all([pool.query("SELECT 1"), redis.ping()]);
          respond(res, 200, { status: "ready" });
        } catch (error) {
          logger.error({ err: error }, "worker.health.readiness_failed");
          respond(res, 503, { status: "unready" });
        }
        return;
      }

      respond(res, 404, { status: "not_found" });
    })().catch((error) => {
      logger.error({ err: error }, "worker.health.unhandled");
      respond(res, 500, { status: "error" });
    });
  });

  server.on("error", (error) => {
    logger.error({ err: error }, "worker.health.server_error");
  });

  return server;
};
