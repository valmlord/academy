import { defineConfig } from "vitest/config";

// Needs Docker. Files run one at a time, so at most two suite networks exist at once and the per-test
// start-state check sees only its own file's objects (design 12.2). The hook timeout covers the setup's
// sweep, the test image pull and the teardown's listings.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int.test.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
