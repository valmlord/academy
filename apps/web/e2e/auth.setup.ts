import { expect, test as setup } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import { credentials } from "./fixtures";

// Signs in once through the API and saves the session for every spec that runs signed in. Its own
// rate-limit bucket, so it never eats an attempt of a sign-in spec.
setup("sign in as the seeded user", async ({ request, baseURL }) => {
  if (baseURL === undefined) throw new Error("baseURL is not configured in playwright.config.ts");
  const response = await request.post("/api/auth/sign-in/email", {
    data: credentials(),
    headers: { origin: new URL(baseURL).origin, "x-forwarded-for": "10.29.255.1" },
  });

  expect(response.status(), "sign-in status of the seeded user").toBe(200);
  await request.storageState({ path: STORAGE_STATE });
});
