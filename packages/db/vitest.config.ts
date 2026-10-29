import { defineConfig } from "vitest/config";

// Unit tests only and no container setup: `pnpm test` must stay Docker-free.
export default defineConfig({ test: { include: ["test/unit/**/*.test.ts"] } });
