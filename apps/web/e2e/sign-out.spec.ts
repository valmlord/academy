import { type APIRequestContext, expect, test } from "@playwright/test";
import {
  emailLabel,
  passwordLabel,
  signedOutNote,
  signInLabel,
  signInTitle,
  signOutLabel,
} from "../lib/copy";
import { credentials, useOwnBucket } from "./fixtures";

// A fresh, signed-out context, so this test signs in through the UI and its own session is the one
// it ends; the request fixture then carries no cookie of the project's storage state either.
test.use({ storageState: { cookies: [], origins: [] } });

const SESSION_COOKIE = "better-auth.session_token";

function pathAndQuery(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

/** The session Better Auth finds for this cookie value: the server's view, not the browser's. */
async function sessionFor(request: APIRequestContext, token: string): Promise<unknown> {
  const response = await request.get("/api/auth/get-session", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test("signing out ends the session on the server and lands on sign-in with the note (AC11, F3)", async ({
  page,
  context,
  request,
}) => {
  const { email, password } = credentials();
  await useOwnBucket(page);
  await page.goto("/sign-in");
  await page.getByLabel(emailLabel, { exact: true }).fill(email);
  await page.getByLabel(passwordLabel, { exact: true }).fill(password);
  await page.getByRole("button", { name: signInLabel }).click();
  await expect.poll(() => pathAndQuery(page.url())).toBe("/");
  // page.url() reads "/" when the new document is committed, which can be before its client
  // scripts have run; an Enter pressed then can be lost, leaving the menu closed (#180). The load
  // event waits for each script that the HTML of "/" fetches, and the #180 control (script
  // requests held) showed the menu opening on Enter once load had fired.
  await page.waitForLoadState("load");
  const old = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)?.value;
  if (old === undefined) throw new Error(`no ${SESSION_COOKIE} cookie after sign-in`);
  // Positive control: the saved value is a valid session, so the null at the end means revoked.
  expect(await sessionFor(request, old)).toMatchObject({ user: { email } });

  const userButton = page.getByRole("button", { name: email, exact: true });
  await userButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toContainText(email);
  await page.keyboard.press("Escape");
  await expect(userButton).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: signOutLabel }).click();

  await expect.poll(() => pathAndQuery(page.url())).toBe("/sign-in?signed-out=1");
  await expect(page.getByText(signedOutNote)).toBeVisible();
  await page.goto("/");
  expect(pathAndQuery(page.url())).toBe("/sign-in?next=%2F");
  await expect(page.getByRole("heading", { level: 1, name: signInTitle })).toBeVisible();
  const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
  expect(cookieNames).not.toContain(SESSION_COOKIE);
  expect(await sessionFor(request, old)).toBeNull();
});
