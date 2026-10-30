import path from "node:path";
import type { NextConfig } from "next";
import { loadRootEnv } from "./lib/root-env.ts";

const repositoryRoot = path.join(import.meta.dirname, "../../");

// Next reads env files from apps/web only, while the repository keeps one root .env (DATABASE_URL for
// pnpm dev). The Docker build context excludes it, so the image never sees it; a variable already set
// in the shell wins over the file. Root pnpm dev runs through turbo, whose strict env mode drops shell
// variables not listed in turbo.json, so every variable this rule must cover is in the dev task's
// passThroughEnv.
// Any NEXT_PUBLIC_* variable in the root .env is inlined into the client bundle of a local next dev or
// next build, so the root .env never holds a secret under that prefix.
// ACADEMY_SKIP_ROOT_ENV=1 skips the file for isolated runs (lib/root-env.ts).
loadRootEnv({
  env: process.env,
  file: path.join(repositoryRoot, ".env"),
  log: (line) => console.error(line),
});

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // next dev rewrites AGENTS.md when it detects a coding agent; the repository keeps its own rules.
  agentRules: false,
  poweredByHeader: false,
};

export default nextConfig;
