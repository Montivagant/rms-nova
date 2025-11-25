import type { PortalContext } from "./data-sources";

const normalize = (value: string) => value.trim().toLowerCase();

const permissionMatches = (candidate: string, required: string) => {
  const normalizedCandidate = normalize(candidate);
  const normalizedRequired = normalize(required);
  if (normalizedCandidate === "*") return true;
  if (normalizedCandidate.endsWith(".*")) {
    const prefix = normalizedCandidate.slice(0, -2);
    return normalizedRequired.startsWith(prefix);
  }
  return normalizedCandidate === normalizedRequired;
};

const isDenied = (permissions: string[], required: string) =>
  permissions
    .filter((perm) => perm.startsWith("!"))
    .some((deny) => permissionMatches(deny.slice(1), required));

const isAllowed = (permissions: string[], required: string) =>
  permissions
    .filter((perm) => !perm.startsWith("!"))
    .some((allow) => permissionMatches(allow, required));

export const hasPermission = (context: PortalContext, required: string | string[]) => {
  const requirements = Array.isArray(required) ? required : [required];
  return requirements.some((permission) => {
    if (isDenied(context.permissions ?? [], permission)) return false;
    return isAllowed(context.permissions ?? [], permission);
  });
};

export const formatPermissionRequirement = (permission: string | string[]) => {
  if (Array.isArray(permission)) {
    return permission.join(" or ");
  }
  return permission;
};
