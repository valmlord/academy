import { defineConfig } from "vitest/config";

// Unit tests only: `pnpm test` must stay Docker-free. Tests that need a daemon live under
// test/integration and run through their own config with `pnpm test:integration`.
export default defineConfig({ test: { include: ["test/unit/**/*.test.ts"] } });
