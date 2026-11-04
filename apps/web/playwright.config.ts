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

export class InvalidE2eSwitchError extends Error {
  constructor(name: string) {
    super(`${name} must be 1 or unset`);
    this.name = "InvalidE2eSwitchError";
  }
}

/**
 * The e2e switches of #32 (design 10.5, D12): exported in the shell only. A typo such as `E2E_TERMINAL=true`
 * fails the run at config load instead of silently skipping the terminal specs.
 */
export function isSwitchOn(
  name: "E2E_TERMINAL" | "E2E_ALL_BROWSERS" | "E2E_SERVICE_DOWN",
): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return false;
  if (value !== "1") throw new InvalidE2eSwitchError(name);
  return true;
}

isSwitchOn("E2E_TERMINAL");
isSwitchOn("E2E_SERVICE_DOWN");
const isAllBrowsers = isSwitchOn("E2E_ALL_BROWSERS");

// The specs that type into a terminal run in their own projects after every other spec, so no other spec has
// a page open on a terminal lesson and takes its session over meanwhile (design 10.5).
const TERMINAL_SPECS = [/terminal\.spec\.ts/, /region-keys\.spec\.ts/];
const REGION_KEYS_SPEC = /region-keys\.spec\.ts/;

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
      testIgnore: TERMINAL_SPECS,
      dependencies: ["setup"],
    },
    {
      name: "terminal",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      testMatch: TERMINAL_SPECS,
      dependencies: ["chromium"],
    },
    // The region keys in the other two engines (D10); CI installs Chromium only, so they run where
    // E2E_ALL_BROWSERS=1 is set (isolated-stack.sh --e2e).
    ...(isAllBrowsers
      ? [
          {
            name: "terminal-firefox",
            use: { ...devices["Desktop Firefox"], storageState: STORAGE_STATE },
            testMatch: REGION_KEYS_SPEC,
            dependencies: ["terminal"],
          },
          {
            name: "terminal-webkit",
            use: { ...devices["Desktop Safari"], storageState: STORAGE_STATE },
            testMatch: REGION_KEYS_SPEC,
            dependencies: ["terminal-firefox"],
          },
        ]
      : []),
  ],
});
