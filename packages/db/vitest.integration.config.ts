import { defineConfig } from "vitest/config";

// Needs Docker: one Postgres container per run (global setup), one fresh database per test.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int.test.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
