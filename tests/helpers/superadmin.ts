import { createAccessToken } from "@nova/auth";

const defaultPermissions = [
  "tenant_registrations.read",
  "tenant_registrations.approve",
  "tenant_registrations.reject"
] as const;

export const makeSuperadminAuthHeader = async (
  permissions: string[] = [...defaultPermissions]
) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set; cannot mint superadmin token for tests.");
  }
  const token = await createAccessToken(
    {
      sub: "00000000-0000-0000-0000-000000000001",
      tenantId: "superadmin",
      roles: ["superadmin"],
      permissions
    },
    secret,
    3600
  );
  return `Bearer ${token}`;
};

export const superadminPermissions = [...defaultPermissions];
