import { loadRegistry } from "@nova/module-registry";
import { z } from "zod";

export type PermissionKey = string;

export const permissionKeySchema = z
  .string()
  .regex(/^[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+(\.[a-z0-9_]+)?$/i, "Invalid permission format");

const registryPermissions = new Set<PermissionKey>(loadRegistry().modules.flatMap((mod) =>
  mod.features.flatMap((feature) => feature.actions.map((action) => `${mod.id}.${feature.id}.${action}`))
));

export type PermissionCheckInput = {
  permissions: PermissionKey[];
  required: PermissionKey | PermissionKey[];
  mode?: "all" | "any";
};

export const hasPermission = ({ permissions, required, mode = "all" }: PermissionCheckInput): boolean => {
  const normalized = Array.isArray(required) ? required : [required];
  const validPermissions = normalized.filter((perm) => {
    if (!permissionKeySchema.safeParse(perm).success) return false;
    return registryPermissions.has(perm) || perm === "*";
  });

  if (validPermissions.length !== normalized.length) return false;

  if (permissions.includes("*")) return true;

  if (mode === "any") {
    return normalized.some((perm) => permissions.includes(perm));
  }

  return normalized.every((perm) => permissions.includes(perm));
};

export const buildPermissionMap = (tenantPermissions: PermissionKey[]): Record<string, boolean> => {
  const map: Record<string, boolean> = {};
  for (const key of tenantPermissions) {
    if (!permissionKeySchema.safeParse(key).success) continue;
    map[key] = true;
  }
  return map;
};
