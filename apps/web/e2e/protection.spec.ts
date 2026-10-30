import { expect, test } from "@playwright/test";
import { signInTitle } from "../lib/copy";

// Anonymous visitors: no session cookie at all.
test.use({ storageState: { cookies: [], origins: [] } });

function pathAndQuery(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

test("an anonymous visit to the dashboard lands on sign-in with next=/", async ({ page }) => {
  await page.goto("/");

  expect(pathAndQuery(page.url())).toBe("/sign-in?next=%2F");
  await expect(page.getByRole("heading", { level: 1, name: signInTitle })).toBeVisible();
});

test("an anonymous lesson URL keeps its path and tab in next", async ({ page }) => {
  await page.goto("/courses/x/lessons/y?tab=checks");

  expect(pathAndQuery(page.url())).toBe(
    "/sign-in?next=%2Fcourses%2Fx%2Flessons%2Fy%3Ftab%3Dchecks",
  );
});

test("the session endpoint answers an anonymous caller itself instead of redirecting", async ({
  request,
}) => {
  const response = await request.get("/api/auth/get-session", { maxRedirects: 0 });

  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
});
