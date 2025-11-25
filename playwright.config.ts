import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_DEV_SERVER_PORT ?? "3130";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /superadmin-.*\.spec\.ts$/,
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
    command: "pnpm --filter @nova/superadmin dev",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT,
      NEXT_PUBLIC_SUPERADMIN_BEARER: "playwright-token",
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3999"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
