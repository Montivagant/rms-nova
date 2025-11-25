import { cookies } from "next/headers";
import { getPortalAccessToken } from "./env";

export const getPortalAuthHeaders = async (): Promise<Record<string, string>> => {
  let cookieToken: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieToken = cookieStore.get("portal_access_token")?.value;
  } catch {
    cookieToken = undefined;
  }
  const envToken = getPortalAccessToken();
  const token = cookieToken ?? envToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const hasPortalSessionCookie = async () => {
  try {
    const cookieStore = await cookies();
    return Boolean(cookieStore.get("portal_access_token"));
  } catch {
    return false;
  }
};
