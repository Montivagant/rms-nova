import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    coverage: {
      enabled: false
    },
    setupFiles: ["tests/integration/setup.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1
      }
    },
    sequence: {
      concurrent: false,
      shuffle: false
    },
    testTimeout: 20_000
  }
});
