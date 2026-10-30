import { expect, type Locator, type Page, type Request, type Route, test } from "@playwright/test";
import {
  emailLabel,
  emptyEmailError,
  passwordLabel,
  retryLabel,
  serverUnreachableMessage,
  signInBusyLabel,
  signInLabel,
  signInTitle,
  tooManyAttemptsMessage,
  wrongCredentialsMessage,
} from "../lib/copy";
import { credentials, useOwnBucket } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

const SIGN_IN_ENDPOINT = "**/api/auth/sign-in/email";
const LESSON = "/courses/a/lessons/b?tab=checks";
const SIGN_IN_WITH_LESSON = `/sign-in?next=${encodeURIComponent(LESSON)}`;
const PHONE_WIDTH = 375;

function pathAndQuery(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

function isSignInPost(request: Request): boolean {
  return (
    request.method() === "POST" && new URL(request.url()).pathname === "/api/auth/sign-in/email"
  );
}

async function fill(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel(emailLabel, { exact: true }).fill(email);
  await page.getByLabel(passwordLabel, { exact: true }).fill(password);
}

async function landsOn(page: Page, path: string): Promise<void> {
  await expect.poll(() => pathAndQuery(page.url())).toBe(path);
}

interface Paint {
  background: string;
  color: string;
}

// proto.css `.button[aria-disabled="true"]` paints `muted` / `muted-foreground`; a probe element
// resolves both tokens in the current theme, so the comparison needs no colour literal.
async function busyPaint(button: Locator): Promise<{ actual: Paint; expected: Paint }> {
  return button.evaluate((element) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--muted)";
    probe.style.color = "var(--muted-foreground)";
    document.body.append(probe);
    const actual = getComputedStyle(element);
    const expected = getComputedStyle(probe);
    const paint = {
      actual: { background: actual.backgroundColor, color: actual.color },
      expected: { background: expected.backgroundColor, color: expected.color },
    };
    probe.remove();
    return paint;
  });
}

async function expectMutedPaint(button: Locator): Promise<void> {
  // The background has a 150ms transition, so the paint is polled until it settles.
  await expect
    .poll(async () => {
      const { actual, expected } = await busyPaint(button);
      return actual.background === expected.background && actual.color === expected.color;
    })
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

test("AC1, AC10, AC8: focus starts in the email field, paste works, sign-in lands on next", async ({
  page,
  context,
}) => {
  const { email, password } = credentials();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: PHONE_WIDTH, height: 800 });
  await page.goto(SIGN_IN_WITH_LESSON);

  await expect(page.getByLabel(emailLabel, { exact: true })).toBeFocused();
  await page.evaluate((text) => navigator.clipboard.writeText(text), email);
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.getByLabel(emailLabel, { exact: true })).toHaveValue(email);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow, "horizontal scroll at 375").toBeLessThanOrEqual(0);
  await page.getByLabel(passwordLabel, { exact: true }).fill(password);
  await page.getByRole("button", { name: signInLabel }).click();

  await landsOn(page, LESSON);
});

test("AC2: an empty submit sends no request", async ({ page }) => {
  const posts: Request[] = [];
  page.on("request", (request) => {
    if (isSignInPost(request)) posts.push(request);
  });
  await page.goto(SIGN_IN_WITH_LESSON);

  await page.getByRole("button", { name: signInLabel }).click();

  await expect(page.getByText(emptyEmailError)).toBeVisible();
  await expect(page.getByLabel(emailLabel, { exact: true })).toBeFocused();
  expect(posts).toHaveLength(0);
});

test("AC3: while the request is in flight the submit button is busy and a second press sends nothing", async ({
  page,
}) => {
  const { email, password } = credentials();
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let routed = 0;
  // Registered after useOwnBucket, so it runs first and hands over to the bucket route afterwards.
  await page.route(SIGN_IN_ENDPOINT, async (route) => {
    routed += 1;
    await released;
    await route.fallback();
  });
  await page.goto(SIGN_IN_WITH_LESSON);
  await fill(page, email, password);

  await page.getByLabel(passwordLabel, { exact: true }).press("Enter");
  const busy = page.getByRole("button", { name: signInBusyLabel });
  await expect(busy).toHaveAttribute("aria-disabled", "true");
  await expect(busy).not.toHaveAttribute("disabled");
  await expectMutedPaint(busy);
  await busy.hover();
  await expectMutedPaint(busy);
  await expect(busy).toHaveCSS("cursor", "progress");
  await busy.press("Enter");
  // Playwright treats aria-disabled as disabled and would wait forever; the user's click is real.
  await busy.click({ force: true });
  release();

  await landsOn(page, LESSON);
  expect(routed).toBe(1);
});

test("AC4: wrong credentials keep the email, clear the password, focus the message", async ({
  page,
}) => {
  const { email, password } = credentials();
  await page.goto(SIGN_IN_WITH_LESSON);
  await fill(page, email, `${password}-wrong`);

  await page.getByRole("button", { name: signInLabel }).click();

  const message = page.getByRole("group", { name: wrongCredentialsMessage });
  await expect(message).toBeFocused();
  await expect(message).not.toHaveAttribute("role", "alert");
  await expect(page.getByLabel(emailLabel, { exact: true })).toHaveValue(email);
  await expect(page.getByLabel(passwordLabel, { exact: true })).toHaveValue("");
  await page.getByLabel(passwordLabel, { exact: true }).fill(password);
  await page.getByRole("button", { name: signInLabel }).click();
  await landsOn(page, LESSON);
});

test("AC8: a next that leaves the origin lands on / instead", async ({
  page,
  context,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error("baseURL is not configured in playwright.config.ts");
  const home = `${new URL(baseURL).origin}/`;
  const { email, password } = credentials();
  // Each value in its raw query form; %09 is a tab, which browsers strip from a URL.
  for (const next of ["//evil.example", "https%3A%2F%2Fevil.example", "%2F%09%2Fevil.example"]) {
    await context.clearCookies();
    await page.goto(`/sign-in?next=${next}`);
    await fill(page, email, password);

    await page.getByRole("button", { name: signInLabel }).click();

    await expect.poll(() => page.url(), `landing after next=${next}`).toBe(home);
  }
});

test("AC6: a network failure offers retry, which re-sends and lands on next", async ({ page }) => {
  const { email, password } = credentials();
  const abort = async (route: Route): Promise<void> => {
    await route.abort();
  };
  await page.route(SIGN_IN_ENDPOINT, abort);
  await page.goto(SIGN_IN_WITH_LESSON);
  await fill(page, email, password);

  await page.getByRole("button", { name: signInLabel }).click();

  await expect(page.getByRole("group", { name: serverUnreachableMessage })).toBeFocused();
  await page.unroute(SIGN_IN_ENDPOINT, abort);
  await page.getByRole("button", { name: retryLabel }).click();
  await landsOn(page, LESSON);
});

test("AC7: the fourth wrong attempt shows the rate-limit message without a number", async ({
  page,
}) => {
  const { email, password } = credentials();
  await page.goto(SIGN_IN_WITH_LESSON);
  const wrong = page.getByRole("group", { name: wrongCredentialsMessage });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await fill(page, email, `${password}-wrong`);
    await page.getByRole("button", { name: signInLabel }).click();
    await expect(wrong, `attempt ${attempt}`).toBeFocused();
  }
  await fill(page, email, `${password}-wrong`);
  await page.getByRole("button", { name: signInLabel }).click();

  const limited = page.getByRole("group", { name: tooManyAttemptsMessage });
  await expect(limited).toBeFocused();
  await expect(limited).not.toHaveText(/\d/);
});

test.describe("before hydration", () => {
  // No JavaScript: the server-rendered form is what an Enter pressed before hydration submits.
  test.use({ javaScriptEnabled: false });

  test("Enter posts the form to the sign-in page and the URL never holds the password", async ({
    page,
  }) => {
    const password = "never-in-a-url-29";
    await page.goto(SIGN_IN_WITH_LESSON);
    await fill(page, "learner@example.com", password);

    const submitted = page.waitForRequest(
      (request) => request.isNavigationRequest() && new URL(request.url()).pathname === "/sign-in",
    );
    await page.getByLabel(passwordLabel, { exact: true }).press("Enter");
    const request = await submitted;

    expect(request.method()).toBe("POST");
    expect(pathAndQuery(request.url())).toBe(SIGN_IN_WITH_LESSON);
    await expect(page.getByRole("heading", { level: 1, name: signInTitle })).toBeVisible();
    expect(page.url()).not.toContain(password);
  });
});
