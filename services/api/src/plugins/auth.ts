import fp from "fastify-plugin";
import { verifyAccessToken } from "@nova/auth";
import { env } from "../config.js";
import { Errors } from "../errors.js";

export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

const bearerPrefix = "bearer ";

export const authPlugin = fp(async (fastify) => {
  fastify.decorateRequest("user", null);

  fastify.addHook("onRequest", async (request) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) return;

    if (!authHeader.toLowerCase().startsWith(bearerPrefix)) {
      throw Errors.authn("Invalid authorization header");
    }

    const token = authHeader.slice(bearerPrefix.length);
    try {
      const payload = await verifyAccessToken(token, env.JWT_SECRET);
      if (!payload.sub || !payload.tenantId) {
        throw Errors.authn();
      }
      request.user = {
        id: String(payload.sub),
        tenantId: String(payload.tenantId),
        roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
        permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : []
      };
    } catch {
      throw Errors.authn();
    }
  });
});
