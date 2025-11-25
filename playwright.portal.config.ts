import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORTAL_PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_PORTAL_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e/portal",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 720 }
  },
  webServer: {
    command: "pnpm tsx tests/e2e/portal/run-portal-with-mock.ts",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT,
      PLAYWRIGHT_PORTAL_PORT: PORT,
      PLAYWRIGHT_PORTAL_BASE_URL: baseURL,
      PLAYWRIGHT_PORTAL_API_MODE: process.env.PLAYWRIGHT_PORTAL_API_MODE ?? "mock"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
