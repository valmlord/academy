import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { destructiveE2eDecision, requireDestructiveE2eInCi } from "./lib/disposable-stack.ts";
import { loadRootEnv, readRootEnvKeys } from "./lib/root-env.ts";
import { expectedProjectFromShell } from "./lib/stack-web-container.ts";

// The specs read SEED_EMAIL / SEED_PASSWORD from the root .env when it exists, like pnpm dev and the
// seed; a variable already set in the shell wins over the file. ACADEMY_SKIP_ROOT_ENV=1 skips the file for
// isolated runs (lib/root-env.ts).
const rootEnvFile = path.join(import.meta.dirname, "../../.env");
loadRootEnv({
  env: process.env,
  file: rootEnvFile,
  log: (line) => console.error(line),
});

// The compose web service's default WEB_PORT; E2E_BASE_URL points the run at any other server.
const defaultBaseUrl = "http://127.0.0.1:3080";
export const baseURL = process.env.E2E_BASE_URL ?? defaultBaseUrl;
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
  name:
    | "E2E_TERMINAL"
    | "E2E_WEBKIT"
    | "E2E_FIREFOX"
    | "E2E_SERVICE_DOWN"
    | "E2E_DISPOSABLE_STACK"
    | "E2E_COURSE_UNREADABLE",
): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return false;
  if (value !== "1") throw new InvalidE2eSwitchError(name);
  return true;
}

export class RetiredE2eSwitchError extends Error {
  constructor() {
    super("E2E_ALL_BROWSERS was replaced by E2E_WEBKIT and E2E_FIREFOX");
    this.name = "RetiredE2eSwitchError";
  }
}

// An old invocation with E2E_ALL_BROWSERS would otherwise silently run Chromium only (D17).
const retiredSwitch = process.env.E2E_ALL_BROWSERS;
if (retiredSwitch !== undefined && retiredSwitch !== "") throw new RetiredE2eSwitchError();

isSwitchOn("E2E_TERMINAL");
isSwitchOn("E2E_SERVICE_DOWN");
isSwitchOn("E2E_COURSE_UNREADABLE");
const isWebkit = isSwitchOn("E2E_WEBKIT");
const isFirefox = isSwitchOn("E2E_FIREFOX");
isSwitchOn("E2E_DISPOSABLE_STACK");

// #106 design 2.8: e2e/environment-actions.spec.ts resets a working folder, so it runs only on a disposable stack
// (isolated-stack.sh --e2e, CI) and skips with this decision's reason anywhere else. The root .env's names are
// read in every Playwright process alike, so a switch from the file never counts as one from the shell. Where CI
// runs the terminal suite, a skip would hide a lost wiring: the config fails at load instead.
const rootEnvKeys = readRootEnvKeys({ env: process.env, file: rootEnvFile });
export const DESTRUCTIVE_E2E = destructiveE2eDecision({ env: process.env, rootEnvKeys, baseURL });
// e2e/course-unreadable.spec.ts changes only a container of this compose project, which its stage names.
export const COURSE_UNREADABLE_PROJECT = expectedProjectFromShell(process.env, rootEnvKeys);
requireDestructiveE2eInCi({ env: process.env, rootEnvKeys, decision: DESTRUCTIVE_E2E });

// The specs that type into a terminal run in their own projects after every other spec, so no other spec has
// a page open on a terminal lesson and takes its session over meanwhile (design 10.5).
const TERMINAL_SPECS = [
  /terminal\.spec\.ts/,
  /region-keys\.spec\.ts/,
  /environment-actions\.spec\.ts/,
];
const REGION_KEYS_SPEC = /region-keys\.spec\.ts/;

// No webServer: the tests run against the compose stack (or a server the caller started).
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: isCi,
  retries: 0,
  reporter: isCi
    ? [["github"], ["html", { open: "never" }], ["json", { outputFile: "test-results/e2e.json" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      // TEMP #201 red control: with JavaScript off every new hydration wait must fail; reverted next commit.
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE, javaScriptEnabled: false },
      testMatch: [
        /catalog\.spec\.ts/,
        /dashboard\.spec\.ts/,
        /not-found\.spec\.ts/,
        /sign-in\.spec\.ts/,
        /sign-out\.spec\.ts/,
        /leak\.spec\.ts/,
      ],
      testIgnore: TERMINAL_SPECS,
      dependencies: ["setup"],
    },
    {
      name: "terminal",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      testMatch: TERMINAL_SPECS,
      dependencies: ["chromium"],
    },
    // The region keys in the other engines (D10). One engine at a time is on the region-keys lesson, so the chain
    // is linear: terminal -> terminal-webkit -> terminal-firefox. WebKit runs with E2E_WEBKIT=1
    // (isolated-stack.sh --e2e). Firefox is opt-in with E2E_FIREFOX=1 and runs last, because Playwright Firefox
    // does not launch on macOS 27 (D17, follow-up 7.7). CI installs Chromium only.
    ...(isWebkit
      ? [
          {
            name: "terminal-webkit",
            use: { ...devices["Desktop Safari"], storageState: STORAGE_STATE },
            testMatch: REGION_KEYS_SPEC,
            dependencies: ["terminal"],
          },
        ]
      : []),
    ...(isFirefox
      ? [
          {
            name: "terminal-firefox",
            use: { ...devices["Desktop Firefox"], storageState: STORAGE_STATE },
            testMatch: REGION_KEYS_SPEC,
            dependencies: [isWebkit ? "terminal-webkit" : "terminal"],
          },
        ]
      : []),
  ],
});
