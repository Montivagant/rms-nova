import { pool } from "../../services/api/src/db.js";

export const truncateAll = async () => {
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM tenant_location_users");
    await client.query("DELETE FROM tenant_feature_flags");
    await client.query("DELETE FROM tenant_modules");
    await client.query("DELETE FROM user_refresh_tokens");
    await client.query("DELETE FROM user_roles");
    await client.query("DELETE FROM role_permissions");
    await client.query("DELETE FROM roles");
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM tenant_locations");
    await client
      .query("DELETE FROM tenant_business_profiles")
      .catch((error: unknown) => {
        if (
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: string }).code === "42P01"
          )
        ) {
          throw error;
        }
      });
    await client.query("DELETE FROM tenants");
    await client.query("DELETE FROM tenant_registrations");
  } finally {
    client.release();
  }
};
