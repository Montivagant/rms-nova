const env = process.env as Record<string, string | undefined>;

env.NODE_ENV = env.NODE_ENV ?? "test";
env.DATABASE_URL = env.DATABASE_URL ?? "postgres://rms_app:Owner%40123@localhost:5432/rms_test";
env.LOG_LEVEL = env.LOG_LEVEL ?? "silent";
env.JWT_SECRET = env.JWT_SECRET ?? "testaccesssecretvalue_should_be_long_enough_123456";
env.REFRESH_TOKEN_SECRET =
  env.REFRESH_TOKEN_SECRET ?? "testrefreshsecretvalue_should_be_long_enough_654321";
env.ACCESS_TOKEN_TTL = env.ACCESS_TOKEN_TTL ?? "900";
env.REFRESH_TOKEN_TTL = env.REFRESH_TOKEN_TTL ?? "2592000";

if (env.SKIP_AUTO_MIGRATE !== "true") {
  const { ensureTestDatabaseMigrated } = await import("../helpers/ensure-migrations.ts");
  await ensureTestDatabaseMigrated();
}

export {};
