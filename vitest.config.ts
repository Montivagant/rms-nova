import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react"
  },
  test: {
    globals: true,
    environment: "jsdom",
    environmentMatchGlobs: [
      ["packages/auth/**", "node"],
      ["packages/billing/**", "node"]
    ],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**"],
    coverage: {
      enabled: true,
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/unit",
      include: ["packages/**/src/**/*.{ts,tsx}", "services/**/src/**/*.{ts,tsx}"],
      exclude: [
        "services/api/scripts/**",
        "services/api/src/index.ts",
        "packages/design-system/src/index.ts",
        "packages/design-system/src/primitives/**/*.stories.tsx",
        "services/api/src/modules/portal/data.ts",
        "services/worker/**",
        "apps/**",
        "tests/**",
        "playwright.config.ts"
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 70,
        lines: 60
      }
    }
  }
});

