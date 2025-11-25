import "dotenv/config";
import { createAccessToken } from "@nova/auth";

void (async () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined. Load the root .env before running this script.");
  }

  const token = await createAccessToken(
    {
      sub: "00000000-0000-0000-0000-000000000001",
      tenantId: "superadmin",
      roles: ["superadmin"],
      permissions: [
        "tenant_registrations.read",
        "tenant_registrations.approve",
        "tenant_registrations.reject"
      ]
    },
    secret,
    60 * 60 * 8
  );

  console.log(token);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
