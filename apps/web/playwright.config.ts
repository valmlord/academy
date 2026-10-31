import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { loadRootEnv } from "./lib/root-env.ts";

// The specs read SEED_EMAIL / SEED_PASSWORD from the root .env when it exists, like pnpm dev and the
// seed; a variable already set in the shell wins over the file. ACADEMY_SKIP_ROOT_ENV=1 skips the file for
// isolated runs (lib/root-env.ts).
loadRootEnv({
  env: process.env,
  file: path.join(import.meta.dirname, "../../.env"),
  log: (line) => console.error(line),
});

// The compose web service's default WEB_PORT; E2E_BASE_URL points the run at any other server.
const defaultBaseUrl = "http://127.0.0.1:3080";
const baseURL = process.env.E2E_BASE_URL ?? defaultBaseUrl;
const isCi = process.env.CI !== undefined;

/** Holds the seeded user's live session cookie: git-ignored, never uploaded with the CI report. */
export const STORAGE_STATE = "playwright/.auth/learner.json";

// No webServer: the tests run against the compose stack (or a server the caller started).
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: isCi,
  retries: 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
});
