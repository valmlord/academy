import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    // Integration tests need Docker and run through vitest.integration.config.ts.
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**", "**/*.int.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
