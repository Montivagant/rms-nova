import { getSuperadminToken } from "@lib/auth";

export type ModuleToggleTotals = {
  module: string;
  enabledCount: number;
  disabledCount: number;
};

export type ModuleToggleAnalytics = {
  windowDays: number;
  totals: ModuleToggleTotals[];
};

export async function getModuleToggleAnalytics(windowDays = 30): Promise<ModuleToggleAnalytics> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:3001";

  const token = await getSuperadminToken();
  const query = new URLSearchParams({ windowDays: String(windowDays) });

  try {
    const response = await fetch(
      `${baseUrl}/v1/superadmin/analytics/module-toggles?${query.toString()}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error("Failed to fetch module toggle analytics"), {
        response,
        payload: error
      });
    }

    const payload = (await response.json()) as { data: ModuleToggleAnalytics };
    return payload.data;
  } catch (error) {
    console.warn("[analytics] Falling back to empty module toggle analytics.", error);
    return { windowDays, totals: [] };
  }
}
