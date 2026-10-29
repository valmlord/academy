import path from "node:path";
import type { NextConfig } from "next";

const repositoryRoot = path.join(import.meta.dirname, "../../");

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
