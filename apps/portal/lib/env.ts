const DEFAULT_API_BASE = "http://localhost:3001";

const getEnvVar = (key: string) => process.env[key] ?? null;

export const getApiBaseUrl = () =>
  getEnvVar("PORTAL_API_BASE_URL") ??
  getEnvVar("API_BASE_URL") ??
  getEnvVar("NEXT_PUBLIC_API_BASE_URL") ??
  DEFAULT_API_BASE;

export const getPortalAccessToken = () =>
  getEnvVar("PORTAL_ACCESS_TOKEN") ?? getEnvVar("NEXT_PUBLIC_PORTAL_ACCESS_TOKEN");

export const hasEnvPortalToken = () => Boolean(getPortalAccessToken());
