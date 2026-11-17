import { expect, type Locator, type Page } from "@playwright/test";

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

type LoadFailures = { scripts: string[]; pageErrors: string[] };
const loadFailures = new WeakMap<Page, LoadFailures>();

/**
 * Records the page's failed script requests and page errors (a ChunkLoadError lands there), so a hydration
 * wait that fails can name the client chunk that never ran. Call it before the page's first navigation.
 */
export function trackLoadFailures(page: Page): void {
  if (loadFailures.has(page)) return;
  const failures: LoadFailures = { scripts: [], pageErrors: [] };
  loadFailures.set(page, failures);
  page.on("requestfailed", (request) => {
    if (request.resourceType() !== "script") return;
    failures.scripts.push(`${request.url()} ${request.failure()?.errorText ?? "no error text"}`);
  });
  page.on("pageerror", (error) => failures.pageErrors.push(error.message));
}

/**
 * Waits until `target` matches exactly one element React hydrated (an own __reactFiber$ key, an internal
 * detail), then one idle period so the commit's passive effects (key listeners, Radix tab stops) have run.
 * evaluateAll neither waits nor throws on zero or several matches, so the poll always gets a verdict. The
 * failures are "in this test" because they include requests a later navigation aborted.
 */
export async function waitForHydration(target: Locator, what: string): Promise<void> {
  const verdict = async (): Promise<string> => {
    const isHydrated = await target.evaluateAll((nodes) =>
      nodes.map((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber$"))),
    );
    if (isHydrated.length === 1 && isHydrated[0] === true) return "hydrated";
    const notHydrated = `not hydrated (${isHydrated.length} matching elements)`;
    const failures = loadFailures.get(target.page());
    if (failures === undefined) return `${notHydrated}; page not tracked`;
    return `${notHydrated}; failed script requests in this test: ${JSON.stringify(failures.scripts)}; page errors: ${JSON.stringify(failures.pageErrors)}`;
  };
  await expect.poll(verdict, { message: what }).toBe("hydrated");
  await target
    .page()
    .evaluate(() => new Promise<void>((done) => requestIdleCallback(() => done())));
}
