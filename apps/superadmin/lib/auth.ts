const TOKEN_STORAGE_KEY = "nova.superadmin.token";

const envFallbackToken =
  process.env.NEXT_PUBLIC_SUPERADMIN_BEARER ??
  process.env.SUPERADMIN_BEARER ??
  null;

export async function getSuperadminToken(): Promise<string | null> {
  if (envFallbackToken) return envFallbackToken;
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function setSuperadminToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export async function clearSuperadminToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}
