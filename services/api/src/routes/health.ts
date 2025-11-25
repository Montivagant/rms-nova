import type { FastifyInstance } from "fastify";

export const registerHealthRoutes = async (app: FastifyInstance) => {
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
  app.get("/ready", async () => ({ status: "ready" }));
};
