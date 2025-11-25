import { getApiBaseUrl } from "./env";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions extends Omit<RequestInit, "method"> {
  method?: HttpMethod;
  path: string;
  cache?: RequestCache;
}

export class PortalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly details?: unknown
  ) {
    super(`Portal API request failed (${status}) for ${path}`);
    this.name = "PortalApiError";
  }
}

export const requestJson = async <T>(options: RequestOptions): Promise<T> => {
  const { path, method = "GET", cache = "no-store", ...rest } = options;
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;

  const response = await fetch(url, {
    method,
    cache,
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers ?? {})
    },
    ...rest
  });

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      details = undefined;
    }
    throw new PortalApiError(response.status, path, details);
  }

  return (await response.json()) as T;
};
