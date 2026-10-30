import type { Page } from "@playwright/test";

export class MissingSeedCredentialsError extends Error {
  constructor(variable: string) {
    super(`${variable} is not set: export it or put it in the root .env (the seeded user, README)`);
    this.name = "MissingSeedCredentialsError";
  }
}

/** The seeded user's credentials (SEED_EMAIL / SEED_PASSWORD), the same values `pnpm seed` used. */
export function credentials(): { email: string; password: string } {
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (email === undefined || email === "") throw new MissingSeedCredentialsError("SEED_EMAIL");
  if (password === undefined || password === "") {
    throw new MissingSeedCredentialsError("SEED_PASSWORD");
  }
  return { email, password };
}

let bucket = 0;

/**
 * Gives this test its own Better Auth rate-limit bucket (always on): the sign-in limit (3 attempts per
 * 10 s per address) and the get-session read every page load makes are both counted per address. Every
 * request to /api/auth/ carries an X-Forwarded-For unique to the test, which Better Auth trusts when it
 * is the only value (ADR-0008 residual risks).
 */
export async function useOwnBucket(page: Page): Promise<void> {
  bucket += 1;
  const address = `10.29.${process.pid % 200}.${bucket % 250}`;
  await page.route("**/api/auth/**", async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "x-forwarded-for": address },
    });
  });
}
