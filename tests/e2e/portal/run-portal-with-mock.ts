import { spawn } from "node:child_process";
import { createPortalMockServer, PORTAL_MOCK_API_BASE_URL } from "./mock-api-server";

const PORT = process.env.PORT ?? process.env.PLAYWRIGHT_PORTAL_PORT ?? "3100";
const NODE_ENV = process.env.NODE_ENV ?? "development";
const API_MODE = (process.env.PLAYWRIGHT_PORTAL_API_MODE ?? "mock").toLowerCase();
const USE_MOCK_API = API_MODE === "mock";

const resolvePortalEnv = (mockApiUrl?: string) => {
  const baseUrl =
    process.env.PORTAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_PORTAL_API_BASE_URL ??
    mockApiUrl;

  if (!baseUrl) {
    throw new Error(
      "[portal-e2e] Missing PORTAL_API_BASE_URL/NEXT_PUBLIC_PORTAL_API_BASE_URL. Provide them when PLAYWRIGHT_PORTAL_API_MODE=live."
    );
  }

  const nextPortalBaseUrl = process.env.NEXT_PUBLIC_PORTAL_API_BASE_URL ?? baseUrl;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV,
    PORT,
    PORTAL_API_BASE_URL: baseUrl,
    NEXT_PUBLIC_PORTAL_API_BASE_URL: nextPortalBaseUrl
  };

  const portalAccessToken = process.env.PORTAL_ACCESS_TOKEN ?? (USE_MOCK_API ? "playwright-portal-token" : undefined);
  if (portalAccessToken) {
    env.PORTAL_ACCESS_TOKEN = portalAccessToken;
  }

  const nextPortalAccessToken =
    process.env.NEXT_PUBLIC_PORTAL_ACCESS_TOKEN ?? (USE_MOCK_API ? portalAccessToken ?? "playwright-portal-token" : undefined);
  if (nextPortalAccessToken) {
    env.NEXT_PUBLIC_PORTAL_ACCESS_TOKEN = nextPortalAccessToken;
  }

  return env;
};

const run = async () => {
  const mockServer = USE_MOCK_API ? createPortalMockServer() : null;

  if (mockServer) {
    await mockServer.listen();
    console.log(`[mock-portal-api] listening at ${PORTAL_MOCK_API_BASE_URL}`);
  } else {
    console.log("[portal-e2e] mock API disabled; expecting real API endpoint via env");
  }

  const portalEnv = resolvePortalEnv(mockServer ? PORTAL_MOCK_API_BASE_URL : undefined);

  const pnpmExecutable = process.env.npm_execpath ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const pnpmArgs = process.env.npm_execpath
    ? [process.env.npm_execpath, "--filter", "@nova/portal", "dev"]
    : ["--filter", "@nova/portal", "dev"];

  const portalProcess = spawn(pnpmExecutable, pnpmArgs, {
    stdio: "inherit",
    env: portalEnv
  });

  const shutdown = async (signal: NodeJS.Signals | "SIGTERM") => {
    if (!portalProcess.killed) {
      portalProcess.kill(signal);
    }
    if (mockServer) {
      await mockServer.close();
    }
  };

  portalProcess.on("exit", async (code) => {
    if (mockServer) {
      await mockServer.close();
    }
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

run().catch((error) => {
  console.error("[portal-e2e] failed to launch portal dev server", error);
  process.exit(1);
});
