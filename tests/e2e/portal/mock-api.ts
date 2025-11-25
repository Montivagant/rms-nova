import { test as base, expect } from "@playwright/test";
import { PORTAL_MOCK_API_BASE_URL } from "./mock-api-server";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForMockApi = async () => {
  const healthUrl = `${PORTAL_MOCK_API_BASE_URL}/healthz`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await sleep(250);
  }
  throw new Error(`Mock portal API not reachable at ${healthUrl}.`);
};

const resetMockApiState = async () => {
  const response = await fetch(`${PORTAL_MOCK_API_BASE_URL}/__mock__/reset`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to reset mock portal API state (${response.status}).`);
  }
};

export const test = base.extend<{ mockPortalApi: undefined }>({
  mockPortalApi: [
    // biome-ignore lint/correctness/noEmptyPattern: no base fixtures required here
    async ({}, use) => {
      await waitForMockApi();
      await resetMockApiState();
      await use(undefined);
    },
    { auto: true }
  ]
});

export { expect };
