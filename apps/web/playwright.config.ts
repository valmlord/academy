import { defineConfig, devices } from "@playwright/test";

// The compose web service's default WEB_PORT; E2E_BASE_URL points the run at any other server.
const defaultBaseUrl = "http://127.0.0.1:3080";
const baseURL = process.env.E2E_BASE_URL ?? defaultBaseUrl;
const isCi = process.env.CI !== undefined;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
