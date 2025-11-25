import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "../errors.js";

const hasPermission = (permissions: string[], required: string) => {
  if (permissions.includes("*")) return true;
  return permissions.includes(required);
};

export const requirePermissions = (...required: string[]) => {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      throw Errors.authn();
    }

    const missing = required.filter((permission) => !hasPermission(user.permissions, permission));
    if (missing.length > 0) {
      throw Errors.authz();
    }
  };
};
